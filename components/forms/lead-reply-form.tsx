"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  leadReplyFormSchema,
  type LeadReplyFormInput
} from "@/features/leads/schemas";
import { apiFetch } from "@/lib/utils/client-api";

function channelLabel(channel: "YELP_THREAD" | "EMAIL" | null) {
  if (channel === "YELP_THREAD") {
    return "Yelp thread";
  }

  if (channel === "EMAIL") {
    return "External email";
  }

  return "None";
}

export function LeadReplyForm({
  leadId,
  defaultChannel,
  canUseYelpThread,
  canUseEmail,
  maskedEmail,
  canMarkAsRead,
  latestOutboundChannel
}: {
  leadId: string;
  defaultChannel: "YELP_THREAD" | "EMAIL" | null;
  canUseYelpThread: boolean;
  canUseEmail: boolean;
  maskedEmail: string | null;
  canMarkAsRead: boolean;
  latestOutboundChannel: "YELP_THREAD" | "EMAIL" | null;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<LeadReplyFormInput>({
    resolver: zodResolver(leadReplyFormSchema),
    defaultValues: {
      channel: defaultChannel ?? (canUseYelpThread ? "YELP_THREAD" : canUseEmail ? "EMAIL" : "YELP_THREAD"),
      subject: "",
      body: ""
    }
  });

  const selectedChannel = watch("channel");
  const noReplyChannel = !canUseYelpThread && !canUseEmail;

  const submit = handleSubmit(async (values) => {
    try {
      const result = await apiFetch<{ status: string; warning?: string | null }>(`/api/leads/${leadId}/reply`, {
        method: "POST",
        body: JSON.stringify(values)
      });

      if (result.status === "PARTIAL" && result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(
          values.channel === "YELP_THREAD"
            ? "Reply posted to the Yelp thread."
            : "External email reply sent."
        );
      }

      reset({
        channel: values.channel,
        subject: "",
        body: ""
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send the reply.");
    }
  });

  const markRead = async () => {
    try {
      const result = await apiFetch<{ warning?: string | null }>(`/api/leads/${leadId}/mark-read`, {
        method: "POST",
        body: JSON.stringify({})
      });

      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success("Lead marked as read on Yelp.");
      }

      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to mark the lead as read.");
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_auto] md:items-end">
        <div className="space-y-2">
          <Label>Reply channel</Label>
          <Select
            defaultValue={watch("channel")}
            onValueChange={(value) => setValue("channel", value as "YELP_THREAD" | "EMAIL", { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {canUseYelpThread ? <SelectItem value="YELP_THREAD">Yelp thread</SelectItem> : null}
              {canUseEmail ? <SelectItem value="EMAIL">External email fallback</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>

        {canMarkAsRead ? (
          <Button disabled={isSubmitting} onClick={markRead} type="button" variant="outline">
            Mark unread as read
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
        {noReplyChannel
          ? "No live reply channel is available for this lead yet."
          : selectedChannel === "YELP_THREAD"
            ? "Posts directly into the Yelp lead conversation. Use this as the primary path when possible."
            : `Sends through Yelp's masked email${maskedEmail ? ` (${maskedEmail})` : ""} and marks the lead as replied on Yelp.`}
        {latestOutboundChannel ? ` Last outbound channel: ${channelLabel(latestOutboundChannel)}.` : ""}
      </div>

      {selectedChannel === "EMAIL" ? (
        <div className="space-y-2">
          <Label htmlFor="lead-reply-subject">Email subject</Label>
          <Input id="lead-reply-subject" placeholder="Thanks for contacting our team" {...register("subject")} />
          {errors.subject ? <p className="text-sm text-destructive">{errors.subject.message}</p> : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="lead-reply-body">Reply</Label>
        <Textarea
          id="lead-reply-body"
          placeholder="Hi, thanks for contacting us. We received your request and will follow up shortly."
          rows={6}
          {...register("body")}
        />
        {errors.body ? <p className="text-sm text-destructive">{errors.body.message}</p> : null}
      </div>

      <div className="flex justify-end">
        <Button disabled={noReplyChannel || isSubmitting} type="submit">
          {isSubmitting ? "Sending..." : selectedChannel === "YELP_THREAD" ? "Send in Yelp thread" : "Send email reply"}
        </Button>
      </div>
    </form>
  );
}
