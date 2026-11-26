import {Button} from '@heroui/react';
import type {ComponentProps} from 'react';

type ActionButtonProps = ComponentProps<typeof Button> & {
  'data-action'?: string;
  'data-view'?: string;
};

export function ActionButton({onPress, ...props}: ActionButtonProps) {
  return (
    <Button
      {...props}
      data-react-action="true"
      onPress={event => {
        onPress?.(event);
        event.target.dispatchEvent(
          new Event('formatted-action', {bubbles: true}),
        );
      }}
    />
  );
}
