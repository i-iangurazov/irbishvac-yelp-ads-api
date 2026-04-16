"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportMetrics, reportRequestFormSchema } from "@/features/reporting/schemas";
import { apiFetch } from "@/lib/utils/client-api";

export function ReportRequestForm({
  businesses
}: {
  businesses: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors }
  } = useForm({
    resolver: zodResolver(reportRequestFormSchema),
    defaultValues: {
      granularity: "DAILY",
      businessIds: businesses.length > 0 ? [businesses[0].id] : [],
      startDate: "",
      endDate: "",
      metrics: ["impressions", "clicks", "adSpendCents"]
    }
  });

  const selectedBusinessIds = watch("businessIds");
  const selectedMetrics = watch("metrics");

  const submit = handleSubmit(async (values) => {
    try {
      const report = await apiFetch<{ id: string }>("/api/reports", {
        method: "POST",
        body: JSON.stringify(values)
      });

      toast.success("Report request submitted.");
      router.push(`/reporting/${report.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request report.");
    }
  });

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Request report</CardTitle>
        <CardDescription>Choose a window, select businesses, and request a delayed Yelp batch snapshot.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 lg:grid-cols-2" onSubmit={submit}>
          <div className="space-y-2">
            <Label>Granularity</Label>
            <Select defaultValue={watch("granularity")} onValueChange={(value) => setValue("granularity", value as "DAILY" | "MONTHLY")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Daily</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Businesses</Label>
            <div className="rounded-lg border border-border p-3">
              <div className="grid gap-2">
                {businesses.map((business) => (
                  <Label className="flex items-center gap-2" key={business.id}>
                    <Checkbox
                      checked={selectedBusinessIds.includes(business.id)}
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? [...selectedBusinessIds, business.id]
                          : selectedBusinessIds.filter((item) => item !== business.id);
                        setValue("businessIds", next);
                      }}
                    />
                    {business.name}
                  </Label>
                ))}
              </div>
            </div>
            {errors.businessIds ? <p className="text-sm text-destructive">{errors.businessIds.message as string}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register("startDate")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">End date</Label>
            <Input id="endDate" type="date" {...register("endDate")} />
            {errors.endDate ? <p className="text-sm text-destructive">{errors.endDate.message}</p> : null}
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label>Metrics</Label>
            <div className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-2">
              {reportMetrics.map((metric) => (
                <Label className="flex items-center gap-2" key={metric}>
                  <Checkbox
                    checked={selectedMetrics.includes(metric)}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...selectedMetrics, metric]
                        : selectedMetrics.filter((item) => item !== metric);
                      setValue("metrics", next);
                    }}
                  />
                  {metric}
                </Label>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Request report"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
