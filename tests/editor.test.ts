import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  formatTimecode,
  evaluateKeyframedProperty,
  splitClipAtTime,
  computeClipFilterStyle,
} from '../src/utils/editorMath';
import { DEFAULT_ADJUSTMENTS, TimelineClip } from '../src/types/editor';
import {
  generateStarterSampleMedia,
  probeMediaFile,
  startFFmpegExportJob,
  getExportJobStatus,
} from '../engine/ffmpegService';
import { ensureDirectories, DIRS } from '../backend/cacheManager';

function createMockClip(overrides?: Partial<TimelineClip>): TimelineClip {
  return {
    id: 'clip_test_1',
    trackId: 'track-v1',
    name: 'Test Video Clip',
    type: 'video',
    startTime: 2.0,
    duration: 8.0,
    trimStart: 0,
    sourceDuration: 10.0,
    positionX: 0,
    positionY: 0,
    scaleX: 100,
    scaleY: 100,
    rotation: 0,
    flipH: false,
    flipV: false,
    anchorX: 50,
    anchorY: 50,
    opacity: 100,
    blendMode: 'normal',
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
    speed: 1,
    reversed: false,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    pitch: 0,
    noiseReduction: false,
    effects: [],
    filterPreset: 'None',
    transitionIn: { type: 'None', duration: 0 },
    transitionOut: { type: 'None', duration: 0 },
    animationIn: 'None',
    animationOut: 'None',
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    keyframes: [],
    ...overrides,
  };
}

describe('Hussain Video Editor - Automated Subsystem Test Suite', () => {
  it('1. Formats SMPTE timecode accurately at 30fps and 60fps', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
    expect(formatTimecode(65.5, 30)).toBe('00:01:05:15');
    expect(formatTimecode(3661.25, 60)).toBe('01:01:01:15');
  });

  it('2. Splits timeline clips accurately at playhead and preserves relative keyframe offsets', () => {
    const clip = createMockClip({
      startTime: 2.0,
      duration: 6.0,
      keyframes: [
        { id: 'k1', timeOffset: 1.0, property: 'scaleX', value: 100 },
        { id: 'k2', timeOffset: 4.5, property: 'scaleX', value: 150 },
      ],
    });

    const res = splitClipAtTime(clip, 5.0);
    expect(res).not.toBeNull();
    const [part1, part2] = res!;
    expect(part1.startTime).toBe(2.0);
    expect(part1.duration).toBe(3.0);
    expect(part1.keyframes.length).toBe(1);

    expect(part2.startTime).toBe(5.0);
    expect(part2.duration).toBe(3.0);
    expect(part2.trimStart).toBe(3.0);
    expect(part2.keyframes.length).toBe(1);
    expect(part2.keyframes[0].timeOffset).toBe(1.5);
  });

  it('3. Evaluates linear keyframe interpolation across clip duration', () => {
    const clip = createMockClip({
      startTime: 0,
      duration: 10,
      scaleX: 100,
      keyframes: [
        { id: 'kf_start', timeOffset: 0, property: 'scaleX', value: 100 },
        { id: 'kf_end', timeOffset: 5, property: 'scaleX', value: 120 },
      ],
    });

    expect(evaluateKeyframedProperty(clip, 'scaleX', 0)).toBe(100);
    expect(evaluateKeyframedProperty(clip, 'scaleX', 2.5)).toBe(110);
    expect(evaluateKeyframedProperty(clip, 'scaleX', 5)).toBe(120);
  });

  it('4. Computes stackable CSS/compositor filters for color adjustments and effects', () => {
    const clip = createMockClip({
      adjustments: {
        ...DEFAULT_ADJUSTMENTS,
        brightness: 20,
        contrast: 15,
      },
      effects: ['Blur', 'Grayscale'],
    });
    const styleStr = computeClipFilterStyle(clip);
    expect(styleStr).toContain('brightness(1.20)');
    expect(styleStr).toContain('contrast(1.15)');
    expect(styleStr).toContain('blur(4px)');
    expect(styleStr).toContain('grayscale(1)');
  });

  it('5. Saves and loads .hveproject files without embedding raw binary media', () => {
    ensureDirectories();
    const projPath = path.join(DIRS.projects, 'unit_test_project.hveproject');
    const projectPayload = {
      id: 'proj_unit_1',
      name: 'Unit Test Project',
      aspectRatio: '16:9',
      resolution: '1920x1080',
      fps: 30,
      tracks: [{ id: 'track-v1', name: 'V1', type: 'video', locked: false, hidden: false, muted: false, solo: false }],
      clips: [createMockClip({ filePath: '/cache/uploads/reference_only.mp4' })],
    };

    fs.writeFileSync(projPath, JSON.stringify(projectPayload, null, 2), 'utf-8');
    expect(fs.existsSync(projPath)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(projPath, 'utf-8'));
    expect(loaded.name).toBe('Unit Test Project');
    expect(loaded.clips[0].filePath).toBe('/cache/uploads/reference_only.mp4');
  });

  it('6. Executes real FFmpeg sample generation and FFprobe metadata & waveform inspection', async () => {
    const samples = await generateStarterSampleMedia();
    expect(samples.length).toBeGreaterThan(0);

    const firstVideo = samples[0];
    expect(firstVideo.duration).toBeGreaterThan(1);
    expect(firstVideo.width).toBeGreaterThan(0);
    expect(firstVideo.fps).toBeGreaterThan(0);

    const reProbed = await probeMediaFile(firstVideo.filePath, 'probe_test', firstVideo.originalName);
    expect(reProbed.hasVideo).toBe(true);
    expect(Array.isArray(reProbed.peaks)).toBe(true);
  }, 25000);

  it('7. Runs real FFmpeg video export job to completion', async () => {
    const samples = await generateStarterSampleMedia();
    const firstVideo = samples[0];

    const job = startFFmpegExportJob({
      projectName: 'Automated_Test_Export',
      format: 'mp4',
      videoCodec: 'libx264',
      resolution: '720p',
      aspectRatio: '16:9',
      fps: 24,
      bitratePreset: 'low',
      audioCodec: 'aac',
      duration: 2,
      clips: [
        {
          id: 'c1',
          name: firstVideo.originalName,
          type: 'video',
          filePath: firstVideo.filePath,
          trackType: 'video',
          startTime: 0,
          duration: 2,
          trimStart: 0,
          speed: 1,
          opacity: 100,
          volume: 100,
          fadeIn: 0,
          fadeOut: 0,
          rotation: 0,
          flipH: false,
          flipV: false,
          scaleX: 100,
          scaleY: 100,
          positionX: 0,
          positionY: 0,
          adjustments: { ...DEFAULT_ADJUSTMENTS },
          effects: [],
        },
      ],
    });

    expect(job.jobId).toContain('export_');

    // Poll until FFmpeg completes the 2-second render
    let current = getExportJobStatus(job.jobId);
    let attempts = 0;
    while (current && current.status === 'rendering' && attempts < 40) {
      await new Promise((r) => setTimeout(r, 250));
      current = getExportJobStatus(job.jobId);
      attempts++;
    }

    expect(current?.status).toBe('completed');
    expect(current?.fileSize).toBeGreaterThan(1000);
  }, 25000);
});
