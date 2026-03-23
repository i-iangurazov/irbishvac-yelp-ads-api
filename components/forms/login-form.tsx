"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/utils/client-api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "admin@yelp-console.local",
      password: "ChangeMe123!"
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);

    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
      });
      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    }
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use an internal staff account to access the Yelp Ads Console.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" {...register("email")} />
            {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password ? <p className="text-sm text-destructive">{errors.password.message}</p> : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
