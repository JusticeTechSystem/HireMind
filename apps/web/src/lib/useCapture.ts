import { useCallback, useEffect, useRef, useState } from 'react';
export type CapStatus = 'off' | 'requesting' | 'on' | 'denied' | 'unsupported' | 'no-audio' | 'cancelled' | 'disconnected' | 'error';
/** Local capture state only. Streams are exposed to the transcriber only; raw audio is never stored. */
export function useCapture() {
  const [mic, setMic] = useState<CapStatus>('off');
  const [sys, setSys] = useState<CapStatus>('off');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [canRecover, setCanRecover] = useState(false);
  // When a lost microphone is plugged back in, OFFER to reconnect; capture never restarts without a user action.
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (mic !== 'disconnected' || !md?.addEventListener) { setCanRecover(false); return; }
    const onChange = async () => { try { if ((await md.enumerateDevices()).some((d) => d.kind === 'audioinput')) setCanRecover(true); } catch { /* ignore */ } };
    md.addEventListener('devicechange', onChange); return () => md.removeEventListener('devicechange', onChange);
  }, [mic]);
  const micStream = useRef<MediaStream | null>(null);
  const sysStream = useRef<MediaStream | null>(null);
  const [streams, setStreams] = useState<{ mic: MediaStream | null; sys: MediaStream | null }>({ mic: null, sys: null });
  const sync = useCallback(() => setStreams({ mic: micStream.current, sys: sysStream.current }), []);
  const stop = (r: React.MutableRefObject<MediaStream | null>) => { r.current?.getTracks().forEach((t) => t.stop()); r.current = null; };

  const stopMic = useCallback(() => { stop(micStream); sync(); setMic('off'); }, []);
  const stopSystem = useCallback(() => { stop(sysStream); sync(); setSys('off'); }, []);

  const startMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setMic('unsupported');
    setMic('requesting'); setCanRecover(false);
    try {
      stop(micStream);
      const s = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
      micStream.current = s; sync();
      s.getAudioTracks()[0].addEventListener('ended', () => { micStream.current = null; sync(); setMic('disconnected'); });
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'));
      setMic('on');
    } catch (e) { setMic((e as DOMException).name === 'NotAllowedError' ? 'denied' : 'error'); }
  }, [deviceId]);

  const startSystem = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) return setSys('unsupported');
    setSys('requesting');
    try {
      stop(sysStream);
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audio = s.getAudioTracks();
      if (audio.length === 0) { s.getTracks().forEach((t) => t.stop()); return setSys('no-audio'); } // never claim capture without an audio track
      s.getVideoTracks().forEach((t) => t.stop()); // video is not needed
      sysStream.current = new MediaStream(audio); sync();
      audio[0].addEventListener('ended', () => { sysStream.current = null; sync(); setSys('off'); });
      setSys('on');
    } catch (e) { setSys((e as DOMException).name === 'NotAllowedError' ? 'cancelled' : 'error'); }
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    [micStream.current, sysStream.current].forEach((s) => s?.getAudioTracks().forEach((t) => (t.enabled = !paused)));
  }, []);

  useEffect(() => () => { stop(micStream); stop(sysStream); }, []);
  return { canRecover, streams, mic, sys, devices, deviceId, setDeviceId, startMic, stopMic, startSystem, stopSystem, setPaused };
}
