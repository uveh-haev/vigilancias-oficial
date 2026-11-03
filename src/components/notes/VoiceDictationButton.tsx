import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { transcribeClinicalAudio } from '../../services/aiClinicalService';

interface VoiceDictationButtonProps {
  onTranscribed: (text: string) => void;
  onError?: (msg: string) => void;
  compact?: boolean;
}

function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function VoiceDictationButton({
  onTranscribed,
  onError,
  compact = false,
}: VoiceDictationButtonProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const cleanupMedia = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, []);

  const reportError = (msg: string) => {
    setInlineError(msg);
    if (onError) onError(msg);
  };

  const startRecording = async () => {
    setInlineError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      reportError('Este navegador no permite grabar audio desde el micrófono.');
      return;
    }
    if (!navigator.onLine) {
      reportError('El dictado por voz requiere conexión para transcribir el audio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = getSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const usedMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: usedMime });
        cleanupMedia();
        setRecording(false);

        if (blob.size < 400) {
          reportError('El audio fue demasiado breve. Intenta dictar nuevamente.');
          return;
        }

        setTranscribing(true);
        try {
          const text = await transcribeClinicalAudio(blob, usedMime);
          if (text) {
            onTranscribed(text);
          } else {
            reportError('No se detectó voz clara en la grabación.');
          }
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : 'No se pudo transcribir el dictado clínico.';
          reportError(msg);
        } finally {
          setTranscribing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      cleanupMedia();
      reportError('Permite el acceso al micrófono para dictar la nota clínica.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      cleanupMedia();
      setRecording(false);
    }
  };

  const formattedTime = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    seconds % 60
  ).padStart(2, '0')}`;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={transcribing}
        onClick={recording ? stopRecording : startRecording}
        className={`inline-flex items-center gap-1.5 rounded-lg border font-semibold transition-colors whitespace-nowrap shrink-0 ${
          compact ? 'min-h-[36px] px-2.5 py-1 text-xs' : 'min-h-[40px] px-3 py-1.5 text-xs'
        } ${
          recording
            ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
        } disabled:opacity-60`}
      >
        {transcribing ? (
          <>
            <Loader2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 animate-spin shrink-0" />
            <span>Transcribiendo…</span>
          </>
        ) : recording ? (
          <>
            <Square className="w-3.5 h-3.5 fill-current shrink-0" />
            <span className="font-mono tabular-nums">Detener ({formattedTime})</span>
          </>
        ) : (
          <>
            <Mic className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
            <span>{compact ? 'Dictar' : 'Dictar por voz'}</span>
          </>
        )}
      </button>

      {inlineError && (
        <span role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-400">
          {inlineError}
        </span>
      )}
    </div>
  );
}
