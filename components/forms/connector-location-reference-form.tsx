"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/utils/client-api";

export function ConnectorLocationReferenceForm({
  locationId,
  defaultReferenceId,
  options
}: {
  locationId: string;
  defaultReferenceId: string | null;
  options: Array<{ id: string; name: string }>;
}) {
  const [value, setValue] = useState(defaultReferenceId ?? "unassigned");
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    try {
      setIsSaving(true);
      await apiFetch("/api/integrations/servicetitan/location-mappings", {
        method: "POST",
        body: JSON.stringify({
          locationId,
          externalCrmLocationId: value === "unassigned" ? "" : value
        })
      });
      toast.success("Location reference saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save ServiceTitan location reference.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="h-9 min-w-[14rem]">
          <SelectValue placeholder="Choose ServiceTitan business unit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="sm" onClick={save} disabled={isSaving}>
        {isSaving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

