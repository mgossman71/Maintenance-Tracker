import * as LabelPrimitive from "@radix-ui/react-label";
import * as React from "react";
import { cn } from "../../lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			className={cn(
				"flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export function Textarea({
	className,
	...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return (
		<textarea
			className={cn(
				"flex min-h-16 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary",
				className,
			)}
			{...props}
		/>
	);
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
	return (
		<LabelPrimitive.Root
			className={cn("text-sm font-medium leading-none text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function Field({
	label,
	error,
	hint,
	children,
	className,
}: {
	label: string;
	error?: string | null;
	hint?: string;
	children: React.ReactNode;
	className?: string;
}) {
	// Associate the label with its control for accessibility (and e2e):
	// forward the label text as aria-label on a single control child.
	const control = React.isValidElement<{ "aria-label"?: string }>(children)
		? React.cloneElement(children, { "aria-label": children.props["aria-label"] ?? label })
		: children;
	return (
		<div className={cn("grid gap-1.5", className)}>
			<Label>{label}</Label>
			{control}
			{hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
			{error ? <p className="text-xs text-destructive">{error}</p> : null}
		</div>
	);
}
