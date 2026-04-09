"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/utils/client-api";

export function ConnectorBusinessLocationForm({
  businessId,
  defaultLocationId,
  locations
}: {
  businessId: string;
  defaultLocationId: string | null;
  locations: Array<{ id: string; name: string }>;
}) {
  const [value, setValue] = useState(defaultLocationId ?? "unassigned");
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    try {
      setIsSaving(true);
      await apiFetch("/api/integrations/servicetitan/business-mappings", {
        method: "POST",
        body: JSON.stringify({
          businessId,
          locationId: value === "unassigned" ? "" : value
        })
      });
      toast.success("Business mapping saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save business mapping.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="h-9 min-w-[13rem]">
          <SelectValue placeholder="Assign location" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
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

