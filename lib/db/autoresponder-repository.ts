import "server-only";

import type {
  LeadAutomationCadence,
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
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true
        }
      },
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
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true
        }
      }
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
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true
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
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true
        }
      },
      template: {
        include: {
          business: {
            select: {
              id: true,
              name: true,
              encryptedYelpBusinessId: true
            }
          }
        }
      }
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
  const [businesses, locations, serviceCategories] = await Promise.all([
    prisma.business.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        encryptedYelpBusinessId: true,
        locationId: true
      },
      orderBy: [{ name: "asc" }]
    }),
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
    businesses,
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
      events: {
        select: {
          id: true,
          eventType: true,
          actorType: true,
          occurredAt: true,
          isReply: true
        },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }]
      },
      conversationActions: {
        select: {
          id: true,
          actionType: true,
          initiator: true,
          status: true,
          createdAt: true,
          completedAt: true
        },
        orderBy: [{ createdAt: "asc" }]
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
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true
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
      }
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
  });
}

export async function listLeadAutomationBusinessOverrides(tenantId: string) {
  return prisma.leadAutomationBusinessOverride.findMany({
    where: { tenantId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true
        }
      }
    },
    orderBy: [{ business: { name: "asc" } }]
  });
}

export async function getLeadAutomationBusinessOverrideByBusinessId(tenantId: string, businessId: string) {
  return prisma.leadAutomationBusinessOverride.findUnique({
    where: {
      tenantId_businessId: {
        tenantId,
        businessId
      }
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true
        }
      }
    }
  });
}

export async function upsertLeadAutomationBusinessOverride(
  tenantId: string,
  businessId: string,
  data: Omit<Prisma.LeadAutomationBusinessOverrideUncheckedCreateInput, "tenantId" | "businessId">
) {
  return prisma.leadAutomationBusinessOverride.upsert({
    where: {
      tenantId_businessId: {
        tenantId,
        businessId
      }
    },
    update: data,
    create: {
      tenantId,
      businessId,
      ...data
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          encryptedYelpBusinessId: true
        }
      }
    }
  });
}

export async function deleteLeadAutomationBusinessOverride(tenantId: string, businessId: string) {
  return prisma.leadAutomationBusinessOverride.delete({
    where: {
      tenantId_businessId: {
        tenantId,
        businessId
      }
    }
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
  cadence?: LeadAutomationCadence;
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
  dueAt?: Date | null;
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
      cadence: data.cadence ?? "INITIAL",
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
      dueAt: data.dueAt ?? null,
      startedAt: data.startedAt ?? null,
      completedAt: data.completedAt ?? null
    }
  });
}

export async function upsertLeadAutomationAttemptByLeadCadence(data: {
  tenantId: string;
  leadId: string;
  businessId?: string | null;
  locationId?: string | null;
  serviceCategoryId?: string | null;
  cadence: LeadAutomationCadence;
  sourceSystem?: RecordSourceSystem;
  dueAt?: Date | null;
}) {
  return prisma.leadAutomationAttempt.upsert({
    where: {
      leadId_cadence: {
        leadId: data.leadId,
        cadence: data.cadence
      }
    },
    update: {
      businessId: data.businessId ?? null,
      locationId: data.locationId ?? null,
      serviceCategoryId: data.serviceCategoryId ?? null,
      sourceSystem: data.sourceSystem ?? "INTERNAL",
      ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {})
    },
    create: {
      tenantId: data.tenantId,
      leadId: data.leadId,
      businessId: data.businessId ?? null,
      locationId: data.locationId ?? null,
      serviceCategoryId: data.serviceCategoryId ?? null,
      cadence: data.cadence,
      sourceSystem: data.sourceSystem ?? "INTERNAL",
      dueAt: data.dueAt ?? null
    }
  });
}

export async function updateLeadAutomationAttempt(
  attemptId: string,
  data: {
    status?: LeadAutomationAttemptStatus;
    skipReason?: LeadAutomationSkipReason | null;
    ruleId?: string | null;
    templateId?: string | null;
    channel?: LeadAutomationChannel | null;
    recipient?: string | null;
    renderedSubject?: string | null;
    renderedBody?: string | null;
    providerMessageId?: string | null;
    providerStatus?: string | null;
    providerMetadataJson?: unknown;
    errorSummary?: string | null;
    dueAt?: Date | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  }
) {
  return prisma.leadAutomationAttempt.update({
    where: { id: attemptId },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.skipReason !== undefined ? { skipReason: data.skipReason } : {}),
      ...(data.ruleId !== undefined ? { ruleId: data.ruleId } : {}),
      ...(data.templateId !== undefined ? { templateId: data.templateId } : {}),
      ...(data.channel !== undefined ? { channel: data.channel } : {}),
      ...(data.recipient !== undefined ? { recipient: data.recipient } : {}),
      ...(data.renderedSubject !== undefined ? { renderedSubject: data.renderedSubject } : {}),
      ...(data.renderedBody !== undefined ? { renderedBody: data.renderedBody } : {}),
      ...(data.providerMessageId !== undefined ? { providerMessageId: data.providerMessageId } : {}),
      ...(data.providerStatus !== undefined ? { providerStatus: data.providerStatus } : {}),
      ...(data.providerMetadataJson !== undefined
        ? { providerMetadataJson: toJsonValue(data.providerMetadataJson) }
        : {}),
      ...(data.errorSummary !== undefined ? { errorSummary: data.errorSummary } : {}),
      ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
      ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
      ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {})
    }
  });
}

export async function getLeadAutomationAttemptSummary(tenantId: string) {
  const now = new Date();
  const [sentCount, failedCount, skippedCount, pendingCount, pendingDueCount, lastSuccessfulAttempt] = await Promise.all([
    prisma.leadAutomationAttempt.count({
      where: {
        tenantId,
        status: "SENT"
      }
    }),
    prisma.leadAutomationAttempt.count({
      where: {
        tenantId,
        status: "FAILED"
      }
    }),
    prisma.leadAutomationAttempt.count({
      where: {
        tenantId,
        status: "SKIPPED"
      }
    }),
    prisma.leadAutomationAttempt.count({
      where: {
        tenantId,
        status: "PENDING"
      }
    }),
    prisma.leadAutomationAttempt.count({
      where: {
        tenantId,
        status: "PENDING",
        dueAt: {
          lte: now
        }
      }
    }),
    prisma.leadAutomationAttempt.findFirst({
      where: {
        tenantId,
        status: "SENT"
      },
      select: {
        completedAt: true,
        triggeredAt: true
      },
      orderBy: [{ completedAt: "desc" }, { triggeredAt: "desc" }]
    })
  ]);

  return {
    sentCount,
    failedCount,
    skippedCount,
    pendingCount,
    pendingDueCount,
    scheduledCount: Math.max(pendingCount - pendingDueCount, 0),
    lastSuccessfulAt: lastSuccessfulAttempt?.completedAt ?? lastSuccessfulAttempt?.triggeredAt ?? null
  };
}

export async function getLeadAutomationBusinessAttemptHealth(tenantId: string) {
  const now = new Date();
  const [sentCounts, failedCounts, pendingDueCounts, lastSuccessfulAttempts] = await Promise.all([
    prisma.leadAutomationAttempt.groupBy({
      by: ["businessId"],
      where: {
        tenantId,
        businessId: {
          not: null
        },
        status: "SENT"
      },
      _count: {
        _all: true
      }
    }),
    prisma.leadAutomationAttempt.groupBy({
      by: ["businessId"],
      where: {
        tenantId,
        businessId: {
          not: null
        },
        status: "FAILED"
      },
      _count: {
        _all: true
      }
    }),
    prisma.leadAutomationAttempt.groupBy({
      by: ["businessId"],
      where: {
        tenantId,
        businessId: {
          not: null
        },
        status: "PENDING",
        dueAt: {
          lte: now
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.leadAutomationAttempt.findMany({
      where: {
        tenantId,
        businessId: {
          not: null
        },
        status: "SENT"
      },
      select: {
        businessId: true,
        completedAt: true,
        triggeredAt: true
      },
      orderBy: [{ completedAt: "desc" }, { triggeredAt: "desc" }],
      distinct: ["businessId"]
    })
  ]);

  return {
    sentCounts,
    failedCounts,
    pendingDueCounts,
    lastSuccessfulAttempts
  };
}

export async function listRecentLeadAutomationAttempts(tenantId: string, take = 10) {
  return prisma.leadAutomationAttempt.findMany({
    where: { tenantId },
    include: {
      business: {
        select: {
          id: true,
          name: true
        }
      },
      lead: {
        select: {
          id: true,
          externalLeadId: true,
          customerName: true
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
      template: {
        select: {
        id: true,
        name: true
      }
    },
    rule: {
      select: {
        id: true,
        name: true,
        cadence: true
      }
    }
  },
    orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }],
    take
  });
}

export async function listDueLeadAutomationAttempts(limit: number, now: Date) {
  return prisma.leadAutomationAttempt.findMany({
    where: {
      status: "PENDING",
      cadence: {
        in: ["FOLLOW_UP_24H", "FOLLOW_UP_7D"]
      },
      dueAt: {
        lte: now
      },
      OR: [{ startedAt: null }, { startedAt: { lte: new Date(now.getTime() - 15 * 60 * 1000) } }]
    },
    select: {
      id: true,
      tenantId: true,
      leadId: true,
      cadence: true,
      dueAt: true
    },
    orderBy: [{ dueAt: "asc" }, { triggeredAt: "asc" }],
    take: limit
  });
}

export async function claimLeadAutomationAttemptForProcessing(
  attemptId: string,
  now: Date,
  staleBefore = new Date(now.getTime() - 15 * 60 * 1000)
) {
  const result = await prisma.leadAutomationAttempt.updateMany({
    where: {
      id: attemptId,
      status: "PENDING",
      completedAt: null,
      dueAt: {
        lte: now
      },
      OR: [{ startedAt: null }, { startedAt: { lte: staleBefore } }]
    },
    data: {
      startedAt: now
    }
  });

  return result.count > 0;
}
