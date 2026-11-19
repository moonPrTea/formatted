import {useSyncExternalStore} from 'react';
import {Button} from '@heroui/react';
import {Monitor, Moon, Sun} from 'lucide-react';
import {
  getThemePreference,
  setThemePreference,
  subscribeTheme,
} from '../theme.js';

const modes = [
  {value: 'light', label: 'Светлая', icon: Sun},
  {value: 'dark', label: 'Тёмная', icon: Moon},
  {value: 'system', label: 'Системная', icon: Monitor},
] as const;

export function ThemePicker() {
  const selected = useSyncExternalStore(subscribeTheme, getThemePreference);
  return (
    <section className="appearance-settings" aria-labelledby="appearance-title">
      <h3 id="appearance-title">Оформление</h3>
      <div className="appearance-modes" role="group" aria-label="Тема">
        {modes.map(({value, label, icon: Icon}) => (
          <Button
            key={value}
            variant={selected === value ? 'secondary' : 'ghost'}
            aria-pressed={selected === value}
            data-theme-choice={value}
            onPress={() => setThemePreference(value)}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}
