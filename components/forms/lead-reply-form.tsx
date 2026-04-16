"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { leadReplyFormSchema, type LeadReplyFormInput } from "@/features/leads/schemas";
import { apiFetch } from "@/lib/utils/client-api";

type LeadReplyDraftResponse = {
  requestId: string;
  channel: "YELP_THREAD" | "EMAIL";
  generatedAt: string;
  needsHumanReply: boolean;
  warnings: Array<{ code: string; message: string }>;
  drafts: Array<{
    id: string;
    title: string;
    subject: string | null;
    body: string;
  }>;
};

type SelectedAiDraft = {
  requestId: string;
  draftId: string;
  channel: "YELP_THREAD" | "EMAIL";
  body: string;
  subject: string | null;
  warningCodes: string[];
};

type ConversationSuggestion = {
  turnId: string;
  title: string;
  subject: string | null;
  body: string;
  warningCodes: string[];
  contentSourceLabel: string;
  promptSourceLabel: string;
  stopReasonLabel: string | null;
};

function channelLabel(channel: "YELP_THREAD" | "EMAIL" | "PHONE" | null) {
  if (channel === "YELP_THREAD") {
    return "Yelp thread";
  }

  if (channel === "EMAIL") {
    return "Yelp masked email";
  }

  if (channel === "PHONE") {
    return "Phone / SMS";
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
  latestOutboundChannel,
  canMarkAsReplied,
  canGenerateAiDrafts,
  conversationSuggestion
}: {
  leadId: string;
  defaultChannel: "YELP_THREAD" | "EMAIL" | null;
  canUseYelpThread: boolean;
  canUseEmail: boolean;
  maskedEmail: string | null;
  canMarkAsRead: boolean;
  latestOutboundChannel: "YELP_THREAD" | "EMAIL" | "PHONE" | null;
  canMarkAsReplied: boolean;
  canGenerateAiDrafts: boolean;
  conversationSuggestion?: ConversationSuggestion | null;
}) {
  const router = useRouter();
  const [externalReplyType, setExternalReplyType] = useState<"PHONE" | "EMAIL">("PHONE");
  const [isMarkingReplied, setIsMarkingReplied] = useState(false);
  const [draftResult, setDraftResult] = useState<LeadReplyDraftResponse | null>(null);
  const [selectedAiDraft, setSelectedAiDraft] = useState<SelectedAiDraft | null>(null);
  const submitIdempotencyKeyRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [isDiscardingDrafts, setIsDiscardingDrafts] = useState(false);
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
  const watchedSubject = watch("subject");
  const watchedBody = watch("body");
  const noReplyChannel = !canUseYelpThread && !canUseEmail;
  const aiDraftEdited = useMemo(() => {
    if (!selectedAiDraft) {
      return false;
    }

    return (
      watchedBody.trim() !== selectedAiDraft.body.trim() ||
      (watchedSubject ?? "").trim() !== (selectedAiDraft.subject ?? "").trim()
    );
  }, [selectedAiDraft, watchedBody, watchedSubject]);

  useEffect(() => {
    if (selectedAiDraft && selectedAiDraft.channel !== selectedChannel) {
      setSelectedAiDraft(null);
    }

    if (draftResult && draftResult.channel !== selectedChannel) {
      setDraftResult(null);
    }
  }, [draftResult, selectedAiDraft, selectedChannel]);

  const submit = handleSubmit(async (values) => {
    try {
      const result = await apiFetch<{ status: string; warning?: string | null }>(`/api/leads/${leadId}/reply`, {
        method: "POST",
        headers: {
          "Idempotency-Key": submitIdempotencyKeyRef.current
        },
        body: JSON.stringify({
          ...values,
          aiDraft: selectedAiDraft
            ? {
                requestId: selectedAiDraft.requestId,
                draftId: selectedAiDraft.draftId,
                edited: aiDraftEdited,
                warningCodes: selectedAiDraft.warningCodes
              }
            : undefined
        })
      });
      submitIdempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      if (result.status === "PARTIAL" && result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(
          values.channel === "YELP_THREAD"
            ? "Reply posted to the Yelp thread."
            : "Yelp masked email reply sent."
        );
      }

      reset({
        channel: values.channel,
        subject: "",
        body: ""
      });
      setSelectedAiDraft(null);
      setDraftResult(null);
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

  const markReplied = async () => {
    setIsMarkingReplied(true);

    try {
      const result = await apiFetch<{ warning?: string | null }>(`/api/leads/${leadId}/mark-replied`, {
        method: "POST",
        body: JSON.stringify({
          replyType: externalReplyType
        })
      });

      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(
          externalReplyType === "PHONE"
            ? "Lead marked replied after phone or SMS follow-up."
            : "Lead marked replied after Yelp masked email follow-up."
        );
      }

      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to mark the lead as replied.");
    } finally {
      setIsMarkingReplied(false);
    }
  };

  const generateDrafts = async () => {
    if (noReplyChannel || !canGenerateAiDrafts) {
      return;
    }

    setIsGeneratingDrafts(true);

    try {
      const result = await apiFetch<LeadReplyDraftResponse>(`/api/leads/${leadId}/reply-draft`, {
        method: "POST",
        body: JSON.stringify({
          channel: selectedChannel,
          variantCount: 3
        })
      });

      setDraftResult(result);
      setSelectedAiDraft(null);

      if (result.needsHumanReply) {
        toast.warning("Drafts generated with caution. Review before sending.");
      } else {
        toast.success("AI drafts generated.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate AI drafts.");
    } finally {
      setIsGeneratingDrafts(false);
    }
  };

  const discardDrafts = async () => {
    if (!draftResult) {
      return;
    }

    setIsDiscardingDrafts(true);

    try {
      await apiFetch<{ status: string }>(`/api/leads/${leadId}/reply-draft/usage`, {
        method: "POST",
        body: JSON.stringify({
          requestId: draftResult.requestId,
          draftId: selectedAiDraft?.draftId,
          action: "DISCARDED"
        })
      });
    } catch {
      // Keep the operator flow responsive even if usage audit logging fails.
    } finally {
      setIsDiscardingDrafts(false);
      setDraftResult(null);
      setSelectedAiDraft(null);
    }
  };

  const applyDraft = (draft: LeadReplyDraftResponse["drafts"][number]) => {
    setValue("body", draft.body, { shouldDirty: true, shouldTouch: true });

    if (selectedChannel === "EMAIL") {
      setValue("subject", draft.subject ?? "", { shouldDirty: true, shouldTouch: true });
    }

    setSelectedAiDraft({
      requestId: draftResult?.requestId ?? draft.id,
      draftId: draft.id,
      channel: selectedChannel,
      body: draft.body,
      subject: draft.subject ?? null,
      warningCodes: draftResult?.warnings.map((warning) => warning.code) ?? []
    });

    toast.success("Draft copied into the reply composer.");
  };

  const applyConversationSuggestion = () => {
    if (!conversationSuggestion || !canUseYelpThread) {
      return;
    }

    setValue("channel", "YELP_THREAD", { shouldValidate: true });
    setValue("body", conversationSuggestion.body, { shouldDirty: true, shouldTouch: true });
    setValue("subject", conversationSuggestion.subject ?? "", { shouldDirty: true, shouldTouch: true });
    setSelectedAiDraft({
      requestId: `conversation:${conversationSuggestion.turnId}`,
      draftId: conversationSuggestion.turnId,
      channel: "YELP_THREAD",
      body: conversationSuggestion.body,
      subject: conversationSuggestion.subject,
      warningCodes: conversationSuggestion.warningCodes
    });
    setDraftResult(null);

    toast.success("Conversation suggestion copied into the reply composer.");
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
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
              {canUseEmail ? <SelectItem value="EMAIL">Yelp masked email fallback</SelectItem> : null}
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
            ? "Primary path. Sends directly into the Yelp thread."
            : `Fallback path. Sends through Yelp's masked email${maskedEmail ? ` (${maskedEmail})` : ""}.`}
        {latestOutboundChannel ? ` Last outbound channel: ${channelLabel(latestOutboundChannel)}.` : ""}
      </div>

      {conversationSuggestion ? (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50/70 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="text-sm font-medium text-amber-950">{conversationSuggestion.title}</div>
              <div className="flex flex-wrap gap-2 text-[11px] font-medium text-amber-900">
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1">
                  Review-only
                </span>
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1">
                  {conversationSuggestion.contentSourceLabel}
                </span>
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1">
                  {conversationSuggestion.promptSourceLabel}
                </span>
              </div>
              {conversationSuggestion.stopReasonLabel ? (
                <p className="text-xs text-amber-900">{conversationSuggestion.stopReasonLabel}</p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-6 text-amber-950">{conversationSuggestion.body}</p>
            </div>
            <Button
              disabled={!canUseYelpThread || isSubmitting}
              onClick={applyConversationSuggestion}
              size="sm"
              type="button"
              variant="outline"
            >
              Use suggestion
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border/80 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">AI draft assist</div>
            <p className="text-xs text-muted-foreground">Review-only suggestions for this channel. Nothing sends automatically.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {draftResult ? (
              <Button
                disabled={isDiscardingDrafts || isGeneratingDrafts}
                onClick={discardDrafts}
                type="button"
                variant="ghost"
              >
                {isDiscardingDrafts ? "Clearing..." : "Discard drafts"}
              </Button>
            ) : null}
            <Button
              disabled={noReplyChannel || !canGenerateAiDrafts || isGeneratingDrafts || isSubmitting}
              onClick={generateDrafts}
              type="button"
              variant="outline"
            >
              {isGeneratingDrafts ? "Generating..." : draftResult ? "Regenerate drafts" : "Generate draft"}
            </Button>
          </div>
        </div>
        {!canGenerateAiDrafts ? (
          <p className="mt-3 text-xs text-muted-foreground">AI drafting is not configured in this environment.</p>
        ) : null}
        {draftResult ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {draftResult.needsHumanReply ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                  Needs human review
                </span>
              ) : null}
              {draftResult.warnings.map((warning) => (
                <span
                  className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  key={warning.code}
                >
                  {warning.message}
                </span>
              ))}
            </div>

            <div className="grid gap-3">
              {draftResult.drafts.map((draft) => {
                const isSelected = selectedAiDraft?.draftId === draft.id;

                return (
                  <div className="rounded-xl border border-border/80 bg-muted/10 p-3" key={draft.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">{draft.title}</div>
                        {selectedChannel === "EMAIL" && draft.subject ? (
                          <div className="text-xs text-muted-foreground">Subject: {draft.subject}</div>
                        ) : null}
                        <p className="whitespace-pre-wrap text-sm leading-6">{draft.body}</p>
                      </div>
                      <Button onClick={() => applyDraft(draft)} size="sm" type="button" variant={isSelected ? "secondary" : "outline"}>
                        {isSelected ? "In composer" : "Use draft"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {canMarkAsReplied ? (
        <div className="grid gap-3 rounded-xl border border-border/80 bg-muted/10 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label>Outside-Yelp follow-up</Label>
            <Select defaultValue={externalReplyType} onValueChange={(value) => setExternalReplyType(value as "PHONE" | "EMAIL")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PHONE">Phone or SMS</SelectItem>
                <SelectItem value="EMAIL">Email sent outside this console</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Use this only after a real phone, SMS, or email handoff happened outside Yelp.</p>
          </div>

          <Button
            disabled={isSubmitting || isMarkingReplied}
            onClick={markReplied}
            type="button"
            variant="outline"
          >
            {isMarkingReplied ? "Saving..." : "Mark replied"}
          </Button>
        </div>
      ) : null}

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
          placeholder="Hi, thanks for reaching out. We received your request and will follow up shortly."
          rows={6}
          {...register("body")}
        />
        {selectedAiDraft ? (
          <p className="text-xs text-muted-foreground">
            The current draft started from AI suggestions. Review and edit it before sending.
          </p>
        ) : null}
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
