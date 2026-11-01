import { cn } from "../../lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("rounded-xl border border-border bg-card shadow-sm", className)}
			{...props}
		/>
	);
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn("flex items-start justify-between gap-2 p-4 pb-2", className)} {...props} />
	);
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
	return <h3 className={cn("font-semibold leading-tight", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("p-4 pt-2", className)} {...props} />;
}

type BadgeVariant = "overdue" | "due" | "soon" | "ok" | "unknown" | "disabled" | "neutral";

const badgeStyles: Record<BadgeVariant, string> = {
	overdue: "bg-destructive/15 text-destructive",
	due: "bg-warning/20 text-warning",
	soon: "bg-warning/10 text-warning",
	ok: "bg-success/15 text-success",
	unknown: "bg-muted text-muted-foreground",
	disabled: "bg-muted text-muted-foreground",
	neutral: "bg-primary/10 text-primary",
};

export function Badge({
	variant = "neutral",
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
				badgeStyles[variant],
				className,
			)}
			{...props}
		/>
	);
}

export function Alert({
	variant = "info",
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "info" | "error" | "warning" }) {
	return (
		<div
			className={cn(
				"rounded-lg border p-3 text-sm",
				variant === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
				variant === "warning" && "border-warning/40 bg-warning/10",
				variant === "info" && "border-border bg-muted text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}
