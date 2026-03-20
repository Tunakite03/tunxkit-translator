import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/lib/utils';

const RadioGroup = React.forwardRef<
   React.ComponentRef<typeof RadioGroupPrimitive.Root>,
   React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
   <RadioGroupPrimitive.Root
      className={cn('flex gap-1 bg-muted rounded-lg p-1', className)}
      {...props}
      ref={ref}
   />
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
   React.ComponentRef<typeof RadioGroupPrimitive.Item>,
   React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, children, ...props }, ref) => (
   <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
         'flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all cursor-pointer text-center data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-xs hover:text-foreground/80',
         className,
      )}
      {...props}
   >
      {children}
   </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
