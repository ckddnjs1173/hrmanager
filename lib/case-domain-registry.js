import {
  createWageIntakeCase,
  getWageCaseReport,
  getWageIntakeCase,
  renderWageCaseDocument,
  updateWageIntakeCase,
} from "./wage-intake-service.js";
import {
  createDismissalCase,
  getDismissalCase,
  getDismissalCaseReport,
  renderDismissalDocument,
  updateDismissalCase,
} from "./dismissal-service.js";
import {
  createRetirementCase,
  getRetirementCase,
  getRetirementCaseReport,
  renderRetirementDocument,
  updateRetirementCase,
} from "./retirement-service.js";
import {
  createWorktimeCase,
  getWorktimeCase,
  getWorktimeCaseReport,
  renderWorktimeDocument,
  updateWorktimeCase,
} from "./worktime-service.js";
import {
  createAnnualLeaveCase,
  getAnnualLeaveCase,
  getAnnualLeaveCaseReport,
  renderAnnualLeaveDocument,
  updateAnnualLeaveCase,
} from "./annual-leave-service.js";

function domain(definition) {
  return Object.freeze(definition);
}

const definitions = [
  domain({
    id: "wage",
    label: "임금체불",
    uiPath: "/wage-intake",
    intakePath: "wage-intake",
    reportPath: "wage-report",
    documentPath: "wage-document",
    create: createWageIntakeCase,
    get: getWageIntakeCase,
    update: updateWageIntakeCase,
    report: getWageCaseReport,
    renderDocument: renderWageCaseDocument,
  }),
  domain({
    id: "dismissal",
    label: "해고·권고사직",
    uiPath: "/dismissal-intake",
    intakePath: "dismissal-intake",
    reportPath: "dismissal-report",
    documentPath: "dismissal-document",
    create: createDismissalCase,
    get: getDismissalCase,
    update: updateDismissalCase,
    report: getDismissalCaseReport,
    renderDocument: renderDismissalDocument,
  }),
  domain({
    id: "retirement",
    label: "퇴직금·퇴직연금",
    uiPath: "/retirement-intake",
    intakePath: "retirement-intake",
    reportPath: "retirement-report",
    documentPath: "retirement-document",
    create: createRetirementCase,
    get: getRetirementCase,
    update: updateRetirementCase,
    report: getRetirementCaseReport,
    renderDocument: renderRetirementDocument,
  }),
  domain({
    id: "worktime",
    label: "근로시간·수당",
    uiPath: "/worktime-intake",
    intakePath: "worktime-intake",
    reportPath: "worktime-report",
    documentPath: "worktime-document",
    create: createWorktimeCase,
    get: getWorktimeCase,
    update: updateWorktimeCase,
    report: getWorktimeCaseReport,
    renderDocument: renderWorktimeDocument,
  }),
  domain({
    id: "annual_leave",
    label: "연차유급휴가·미사용수당",
    uiPath: "/annual-leave-intake",
    intakePath: "annual-leave-intake",
    reportPath: "annual-leave-report",
    documentPath: "annual-leave-document",
    create: createAnnualLeaveCase,
    get: getAnnualLeaveCase,
    update: updateAnnualLeaveCase,
    report: getAnnualLeaveCaseReport,
    renderDocument: renderAnnualLeaveDocument,
  }),
];

function assertUnique(field) {
  const values = definitions.map((item) => item[field]);
  if (new Set(values).size !== values.length) {
    throw new Error(`duplicate Case domain ${field}`);
  }
}

for (const field of ["id", "uiPath", "intakePath", "reportPath", "documentPath"]) assertUnique(field);
for (const item of definitions) {
  for (const operation of ["create", "get", "update", "report", "renderDocument"]) {
    if (typeof item[operation] !== "function") throw new Error(`invalid Case domain operation: ${item.id}.${operation}`);
  }
}

export const CASE_DOMAIN_REGISTRY = Object.freeze(definitions);

export function getCaseDomain(id) {
  return CASE_DOMAIN_REGISTRY.find((item) => item.id === id) || null;
}

export function getCaseDomainByIntakePath(path) {
  return CASE_DOMAIN_REGISTRY.find((item) => item.intakePath === path) || null;
}
