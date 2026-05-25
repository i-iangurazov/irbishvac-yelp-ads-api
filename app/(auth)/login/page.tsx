import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div className="hidden rounded-lg border border-border bg-card p-8 lg:block">
          <div className="max-w-lg">
            <div className="text-sm font-medium text-muted-foreground">
              Internal operations
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              Yelp Ads Console
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Staff workspace for lead intake, business readiness, ads programs,
              reporting, audit history, and live Yelp credentials.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-muted-foreground">
              <div className="rounded-md border border-border bg-background px-3 py-2">
                Role-based access for staff users
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                Saved credentials and API health checks
              </div>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                Operator audit trail for live changes
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
