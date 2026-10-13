import { SettingRow } from '@/components/setting-row';
import { Switch } from '@/components/ui/switch';

interface EnabledSettingProps {
  /** What being disabled means, under the title. */
  description: string;
  /** Whether it is on, as last saved. */
  enabled: boolean;
  /** True while a change is being saved, which holds the switch. */
  saving: boolean;
  /** Called with the new value as soon as the switch is flipped. */
  onChange: (enabled: boolean) => void;
}

/** The Enabled row of a detail page: a switch that saves as soon as it is flipped, with no Save button. */
export function EnabledSetting({ description, enabled, saving, onChange }: EnabledSettingProps) {
  return (
    <SettingRow
      title="Enabled"
      description={description}
      actionSlot={({ titleId }) => (
        <Switch checked={enabled} disabled={saving} aria-labelledby={titleId} onCheckedChange={onChange} />
      )}
    />
  );
}
