"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/utils/client-api";

export function ConnectorServiceMappingForm({
  serviceCategoryId,
  defaultCodes
}: {
  serviceCategoryId: string;
  defaultCodes: string[];
}) {
  const [value, setValue] = useState(defaultCodes.join(", "));
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    try {
      setIsSaving(true);
      await apiFetch("/api/integrations/servicetitan/service-mappings", {
        method: "POST",
        body: JSON.stringify({
          serviceCategoryId,
          crmCodes: value
        })
      });
      toast.success("Service mapping saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save service mapping.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        className="h-9 min-w-[14rem]"
        placeholder="ServiceTitan category IDs or names"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="button" variant="outline" size="sm" onClick={save} disabled={isSaving}>
        {isSaving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

