import "server-only";

import type {
  LeadAutomationAttemptStatus,
  LeadAutomationChannel,
  LeadAutomationSkipReason,
  Prisma,
  RecordSourceSystem
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

export async function listLeadAutomationTemplates(tenantId: string) {
  return prisma.leadAutomationTemplate.findMany({
    where: { tenantId },
    include: {
      _count: {
        select: {
          rules: true,
          attempts: true
        }
      }
    },
    orderBy: [{ isEnabled: "desc" }, { name: "asc" }, { createdAt: "asc" }]
  });
}

export async function getLeadAutomationTemplateById(tenantId: string, templateId: string) {
  return prisma.leadAutomationTemplate.findFirst({
    where: {
      tenantId,
      id: templateId
    }
  });
}

export async function createLeadAutomationTemplate(
  tenantId: string,
  data: Omit<Prisma.LeadAutomationTemplateUncheckedCreateInput, "tenantId">
) {
  return prisma.leadAutomationTemplate.create({
    data: {
      tenantId,
      ...data
    }
  });
}

export async function updateLeadAutomationTemplate(
  templateId: string,
  data: Prisma.LeadAutomationTemplateUncheckedUpdateInput
) {
  return prisma.leadAutomationTemplate.update({
    where: { id: templateId },
    data
  });
}

export async function listLeadAutomationRules(tenantId: string) {
  return prisma.leadAutomationRule.findMany({
    where: { tenantId },
    include: {
      template: true,
      location: {
        select: {
          id: true,
          name: true
        }
      },
      serviceCategory: {
        select: {
          id: true,
          name: true
        }
      },
      _count: {
        select: {
          attempts: true
        }
      }
    },
    orderBy: [{ isEnabled: "desc" }, { priority: "asc" }, { createdAt: "asc" }]
  });
}

export async function getLeadAutomationRuleById(tenantId: string, ruleId: string) {
  return prisma.leadAutomationRule.findFirst({
    where: {
      tenantId,
      id: ruleId
    }
  });
}

export async function createLeadAutomationRule(
  tenantId: string,
  data: Omit<Prisma.LeadAutomationRuleUncheckedCreateInput, "tenantId">
) {
  return prisma.leadAutomationRule.create({
    data: {
      tenantId,
      ...data
    }
  });
}

export async function updateLeadAutomationRule(
  ruleId: string,
  data: Prisma.LeadAutomationRuleUncheckedUpdateInput
) {
  return prisma.leadAutomationRule.update({
    where: { id: ruleId },
    data
  });
}

export async function listLeadAutomationOptions(tenantId: string) {
  const [locations, serviceCategories] = await Promise.all([
    prisma.location.findMany({
      where: {
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        name: true
      },
      orderBy: [{ name: "asc" }]
    }),
    prisma.serviceCategory.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true
      },
      orderBy: [{ name: "asc" }]
    })
  ]);

  return {
    locations,
    serviceCategories
  };
}

export async function getLeadAutomationCandidate(tenantId: string, leadId: string) {
  return prisma.yelpLead.findFirstOrThrow({
    where: {
      tenantId,
      id: leadId
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          locationId: true,
          location: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      location: {
        select: {
          id: true,
          name: true
        }
      },
      serviceCategory: {
        select: {
          id: true,
          name: true
        }
      },
      automationAttempts: {
        include: {
          rule: {
            include: {
              location: {
                select: {
                  id: true,
                  name: true
                }
              },
              serviceCategory: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          template: true
        },
        orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }]
      }
    }
  });
}

export async function listEnabledLeadAutomationRules(tenantId: string) {
  return prisma.leadAutomationRule.findMany({
    where: {
      tenantId,
      isEnabled: true,
      template: {
        isEnabled: true
      }
    },
    include: {
      template: true,
      location: {
        select: {
          id: true,
          name: true
        }
      },
      serviceCategory: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
  });
}

export async function createLeadAutomationAttempt(data: {
  tenantId: string;
  leadId: string;
  businessId?: string | null;
  locationId?: string | null;
  serviceCategoryId?: string | null;
  ruleId?: string | null;
  templateId?: string | null;
  channel?: LeadAutomationChannel | null;
  status?: LeadAutomationAttemptStatus;
  skipReason?: LeadAutomationSkipReason | null;
  sourceSystem?: RecordSourceSystem;
  recipient?: string | null;
  renderedSubject?: string | null;
  renderedBody?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  providerMetadataJson?: unknown;
  errorSummary?: string | null;
  triggeredAt?: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}) {
  return prisma.leadAutomationAttempt.create({
    data: {
      tenantId: data.tenantId,
      leadId: data.leadId,
      businessId: data.businessId ?? null,
      locationId: data.locationId ?? null,
      serviceCategoryId: data.serviceCategoryId ?? null,
      ruleId: data.ruleId ?? null,
      templateId: data.templateId ?? null,
      channel: data.channel ?? null,
      status: data.status ?? "PENDING",
      skipReason: data.skipReason ?? null,
      sourceSystem: data.sourceSystem ?? "INTERNAL",
      recipient: data.recipient ?? null,
      renderedSubject: data.renderedSubject ?? null,
      renderedBody: data.renderedBody ?? null,
      providerMessageId: data.providerMessageId ?? null,
      providerStatus: data.providerStatus ?? null,
      providerMetadataJson:
        data.providerMetadataJson === undefined ? undefined : toJsonValue(data.providerMetadataJson),
      errorSummary: data.errorSummary ?? null,
      triggeredAt: data.triggeredAt ?? new Date(),
      startedAt: data.startedAt ?? null,
      completedAt: data.completedAt ?? null
    }
  });
}

export async function updateLeadAutomationAttempt(
  attemptId: string,
  data: {
    status?: LeadAutomationAttemptStatus;
    skipReason?: LeadAutomationSkipReason | null;
    recipient?: string | null;
    renderedSubject?: string | null;
    renderedBody?: string | null;
    providerMessageId?: string | null;
    providerStatus?: string | null;
    providerMetadataJson?: unknown;
    errorSummary?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  }
) {
  return prisma.leadAutomationAttempt.update({
    where: { id: attemptId },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.skipReason !== undefined ? { skipReason: data.skipReason } : {}),
      ...(data.recipient !== undefined ? { recipient: data.recipient } : {}),
      ...(data.renderedSubject !== undefined ? { renderedSubject: data.renderedSubject } : {}),
      ...(data.renderedBody !== undefined ? { renderedBody: data.renderedBody } : {}),
      ...(data.providerMessageId !== undefined ? { providerMessageId: data.providerMessageId } : {}),
      ...(data.providerStatus !== undefined ? { providerStatus: data.providerStatus } : {}),
      ...(data.providerMetadataJson !== undefined
        ? { providerMetadataJson: toJsonValue(data.providerMetadataJson) }
        : {}),
      ...(data.errorSummary !== undefined ? { errorSummary: data.errorSummary } : {}),
      ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
      ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {})
    }
  });
}
