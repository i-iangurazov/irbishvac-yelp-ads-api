import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="grid w-full max-w-5xl gap-12 lg:grid-cols-[1.2fr_0.9fr]">
        <div className="hidden rounded-[2rem] bg-slate-950 p-10 text-slate-50 lg:block">
          <div className="max-w-lg">
            <div className="text-sm uppercase tracking-[0.2em] text-amber-300">Internal operations</div>
            <h1 className="mt-6 text-5xl font-semibold leading-tight">
              Operate Yelp Ads workflows without raw API requests.
            </h1>
            <p className="mt-6 text-base text-slate-300">
              This console centralizes business readiness, ad programs, feature settings, reporting, audit history, and
              environment-specific Yelp enablement into one safe UI for non-technical teams.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
