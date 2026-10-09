import { useCallback, useEffect, useState } from 'react';
import { defaultEventSettings, fetchEventSettings } from './eventSettings';
import type { EventSettings } from './eventSettings';

export function useEventSettings() {
  const [settings, setSettings] = useState<EventSettings>(defaultEventSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchEventSettings();
      setSettings(next);
    } catch (err) {
      setSettings(defaultEventSettings);
      setError(err instanceof Error ? err.message : 'Failed to load event settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { settings, loading, error, reload: load };
}
