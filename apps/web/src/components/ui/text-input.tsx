import type { ComponentProps } from 'react';

import { cx } from '../../../styled-system/css';
import { textInput } from '../../../styled-system/recipes';

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cx(textInput(), className)} />;
}
