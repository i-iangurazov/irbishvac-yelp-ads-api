"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { businessSearchSchema } from "@/features/businesses/schemas";
import { apiFetch } from "@/lib/utils/client-api";
import { formatYelpCategory, normalizeYelpCategories } from "@/lib/yelp/categories";

type ResultState = {
  local: Array<{ id: string; name: string; city: string | null; state: string | null }>;
  remote: Array<{
    encrypted_business_id: string;
    name: string;
    city?: string;
    state?: string;
    categories?: Array<string | { label?: string; alias?: string; title?: string; name?: string }>;
  }>;
  remoteState?: { message: string };
};

export function BusinessSearchForm() {
  const [results, setResults] = useState<ResultState | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm({
    resolver: zodResolver(businessSearchSchema),
    defaultValues: {
      query: "",
      location: ""
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    const data = await apiFetch<ResultState>("/api/businesses/search", {
      method: "POST",
      body: JSON.stringify(values)
    });

    setResults(data);
  });

  return (
    <div className="space-y-4">
      <form className="grid gap-4 rounded-2xl border border-border/80 bg-card p-5 lg:grid-cols-[2fr_1fr_auto]" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="query">Business name</Label>
          <Input id="query" placeholder="Northwind HVAC" {...register("query")} />
          {errors.query ? <p className="text-sm text-destructive">{errors.query.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" placeholder="San Francisco, CA" {...register("location")} />
        </div>
        <Button className="self-end" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search Yelp
        </Button>
      </form>

      {results ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Already saved in console</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.local.length === 0 ? (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={2}>
                        No saved businesses matched.
                      </TableCell>
                    </TableRow>
                  ) : (
                    results.local.map((business) => (
                      <TableRow key={business.id}>
                        <TableCell>
                          <Link className="font-medium hover:underline" href={`/businesses/${business.id}`}>
                            {business.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {[business.city, business.state].filter(Boolean).join(", ") || "Not set"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <div className="font-medium">Yelp partner matches</div>
                <div className="text-xs text-muted-foreground">Save the exact Yelp business the console should operate against.</div>
              </div>
              {results.remoteState ? <p className="text-sm text-warning">{results.remoteState.message}</p> : null}
              <div className="space-y-3">
              {results.remote.map((match) => (
                <div key={match.encrypted_business_id} className="rounded-lg border border-border p-3">
                  {(() => {
                    const categories = normalizeYelpCategories(match.categories ?? []);

                    return (
                      <>
                    <div className="font-medium">{match.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {[match.city, match.state].filter(Boolean).join(", ")}
                    </div>
                    <div className="mt-2 text-sm">{categories.length > 0 ? categories.map(formatYelpCategory).join(", ") : "No categories returned"}</div>
                    <div className="mt-2 text-xs text-muted-foreground">{match.encrypted_business_id}</div>
                    <Button
                      className="mt-3"
                      size="sm"
                      type="button"
                      onClick={async () => {
                        try {
                          const saved = await apiFetch<{ id: string }>("/api/businesses", {
                            method: "POST",
                            body: JSON.stringify({
                              ...match,
                              source: "match"
                            })
                          });
                          toast.success("Business saved.");
                          window.location.assign(`/businesses/${saved.id}`);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Unable to save business.");
                        }
                      }}
                    >
                      Save business
                    </Button>
                      </>
                    );
                  })()}
                </div>
              ))}
                {results.remote.length === 0 && !results.remoteState ? (
                  <p className="text-sm text-muted-foreground">No partner matches returned.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
