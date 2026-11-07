import type { ComponentProps } from 'react';
import { cx } from '../../../styled-system/css';
import { button } from '../../../styled-system/recipes';
import type { RecipeVariantProps } from '../../../styled-system/types';

type ButtonProps = ComponentProps<'button'> & RecipeVariantProps<typeof button>;

export function Button({ visual, className, type = 'button', ...props }: ButtonProps) {
  // Explicit submission is opt-in so reusable actions do not submit forms accidentally.
  return <button {...props} type={type} className={cx(button({ visual }), className)} />;
}
