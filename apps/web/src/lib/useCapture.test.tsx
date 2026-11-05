import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapture } from './useCapture';

class Track extends EventTarget { enabled = true; stopped = false; constructor(public kind: 'audio' | 'video') { super(); } stop() { this.stopped = true; } }
class Stream { constructor(public tracks: Track[]) {} getTracks() { return this.tracks; } getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); } getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); } }
const denied = () => new DOMException('no', 'NotAllowedError');
const setMedia = (m: unknown) => Object.defineProperty(navigator, 'mediaDevices', { value: m, configurable: true });

beforeEach(() => { (globalThis as any).MediaStream = class extends Stream { constructor(t: Track[]) { super(t); } }; });
afterEach(() => { setMedia(undefined); vi.restoreAllMocks(); });

describe('microphone capture', () => {
  it('reports unsupported browsers', async () => { setMedia(undefined); const { result } = renderHook(() => useCapture()); await act(() => result.current.startMic()); expect(result.current.mic).toBe('unsupported'); });
  it('handles permission denial', async () => {
    setMedia({ getUserMedia: vi.fn().mockRejectedValue(denied()) }); const { result } = renderHook(() => useCapture()); await act(() => result.current.startMic()); expect(result.current.mic).toBe('denied');
  });
  it('captures, lists devices, and detects device disconnection', async () => {
    const t = new Track('audio'); const enumerate = vi.fn().mockResolvedValue([{ kind: 'audioinput', deviceId: 'a', label: 'Mic' }, { kind: 'videoinput', deviceId: 'v' }]);
    setMedia({ getUserMedia: vi.fn().mockResolvedValue(new Stream([t])), enumerateDevices: enumerate }); const { result } = renderHook(() => useCapture());
    await act(() => result.current.startMic()); expect(result.current.mic).toBe('on'); expect(result.current.devices).toHaveLength(1);
    act(() => { t.dispatchEvent(new Event('ended')); }); expect(result.current.mic).toBe('disconnected'); expect(result.current.streams.mic).toBeNull();
  });
  it('stops immediately on request', async () => {
    const t = new Track('audio'); setMedia({ getUserMedia: vi.fn().mockResolvedValue(new Stream([t])), enumerateDevices: vi.fn().mockResolvedValue([]) }); const { result } = renderHook(() => useCapture());
    await act(() => result.current.startMic()); act(() => result.current.stopMic()); expect(t.stopped).toBe(true); expect(result.current.mic).toBe('off');
  });
});

describe('system audio capture', () => {
  it('never claims capture when no audio track was shared', async () => {
    const v = new Track('video'); setMedia({ getDisplayMedia: vi.fn().mockResolvedValue(new Stream([v])) }); const { result } = renderHook(() => useCapture());
    await act(() => result.current.startSystem()); expect(result.current.sys).toBe('no-audio'); expect(v.stopped).toBe(true); expect(result.current.streams.sys).toBeNull();
  });
  it('handles cancelled screen sharing', async () => {
    setMedia({ getDisplayMedia: vi.fn().mockRejectedValue(denied()) }); const { result } = renderHook(() => useCapture()); await act(() => result.current.startSystem()); expect(result.current.sys).toBe('cancelled');
  });
  it('keeps only the audio track and drops video', async () => {
    const a = new Track('audio'), v = new Track('video'); setMedia({ getDisplayMedia: vi.fn().mockResolvedValue(new Stream([a, v])) }); const { result } = renderHook(() => useCapture());
    await act(() => result.current.startSystem()); expect(result.current.sys).toBe('on'); expect(v.stopped).toBe(true); expect(a.stopped).toBe(false);
  });
  it('reports unsupported browsers', async () => { setMedia({}); const { result } = renderHook(() => useCapture()); await act(() => result.current.startSystem()); expect(result.current.sys).toBe('unsupported'); });
});

describe('independence and pausing', () => {
  it('stopping the mic leaves system audio running (and vice versa)', async () => {
    const m = new Track('audio'), s = new Track('audio');
    setMedia({ getUserMedia: vi.fn().mockResolvedValue(new Stream([m])), enumerateDevices: vi.fn().mockResolvedValue([]), getDisplayMedia: vi.fn().mockResolvedValue(new Stream([s, new Track('video')])) });
    const { result } = renderHook(() => useCapture()); await act(() => result.current.startMic()); await act(() => result.current.startSystem());
    act(() => result.current.stopMic()); expect(result.current.mic).toBe('off'); expect(result.current.sys).toBe('on'); expect(s.stopped).toBe(false);
    act(() => result.current.stopSystem()); expect(s.stopped).toBe(true);
  });
  it('pause disables tracks without stopping them; resume re-enables', async () => {
    const m = new Track('audio'); setMedia({ getUserMedia: vi.fn().mockResolvedValue(new Stream([m])), enumerateDevices: vi.fn().mockResolvedValue([]) }); const { result } = renderHook(() => useCapture());
    await act(() => result.current.startMic()); act(() => result.current.setPaused(true)); expect(m.enabled).toBe(false); expect(m.stopped).toBe(false); act(() => result.current.setPaused(false)); expect(m.enabled).toBe(true);
  });
  it('releases devices on unmount', async () => {
    const m = new Track('audio'); setMedia({ getUserMedia: vi.fn().mockResolvedValue(new Stream([m])), enumerateDevices: vi.fn().mockResolvedValue([]) }); const { result, unmount } = renderHook(() => useCapture());
    await act(() => result.current.startMic()); unmount(); expect(m.stopped).toBe(true);
  });
});

describe('microphone recovery', () => {
  it('offers (never forces) reconnection when a mic is plugged back in', async () => {
    const t = new Track('audio'); const getUserMedia = vi.fn().mockResolvedValue(new Stream([t]));
    const md = Object.assign(new EventTarget(), { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([{ kind: 'audioinput', deviceId: 'a', label: 'Mic' }]) }); setMedia(md);
    const { result } = renderHook(() => useCapture()); await act(() => result.current.startMic()); act(() => { t.dispatchEvent(new Event('ended')); }); expect(result.current.mic).toBe('disconnected'); expect(result.current.canRecover).toBe(false);
    await act(async () => { md.dispatchEvent(new Event('devicechange')); }); await waitFor(() => expect(result.current.canRecover).toBe(true)); expect(getUserMedia).toHaveBeenCalledTimes(1);
    await act(() => result.current.startMic()); expect(getUserMedia).toHaveBeenCalledTimes(2); expect(result.current.canRecover).toBe(false);
  });
});
