import test from "node:test";
import assert from "node:assert/strict";
import { getAnnualLeaveLegalContext, selectAnnualLeaveLegalVersion } from "../lib/annual-leave-rules.js";

const base={workplaceEmployeeCount:8,averageWeeklyScheduledHours:40,fivePlusContinuouslyPastYear:true,attendanceRatePercent:100,claimedUnusedDays:5,dailyLeavePayAmount:100000,amountAlreadyPaid:0,usePromotionImplemented:false,employerPreventedUse:false};

test("exact 365-day employment ending before first anniversary has monthly accrual only",()=>{
  const legal=getAnnualLeaveLegalContext({...base,referenceDate:"2025-12-31",employmentStartDate:"2025-01-01",employmentStatus:"ended",employmentEndDate:"2025-12-31"});
  assert.equal(legal.entitlement.firstYearMonthlyAccrued,11);
  assert.equal(legal.entitlement.latestAnnualGrant.days,0);
  assert.equal(legal.entitlement.latestAnnualGrant.status,"not_accrued_yet");
});

test("employment continuing on the first anniversary activates the 15-day annual grant baseline",()=>{
  const legal=getAnnualLeaveLegalContext({...base,referenceDate:"2026-01-01",employmentStartDate:"2025-01-01",employmentStatus:"ended",employmentEndDate:"2026-01-01"});
  assert.equal(legal.entitlement.firstYearMonthlyAccrued,11);
  assert.equal(legal.entitlement.latestAnnualGrant.grantDate,"2026-01-01");
  assert.equal(legal.entitlement.latestAnnualGrant.days,15);
});

test("three completed years adds one seniority day",()=>{
  const legal=getAnnualLeaveLegalContext({...base,referenceDate:"2026-01-01",employmentStartDate:"2023-01-01",employmentStatus:"current"});
  assert.equal(legal.entitlement.latestAnnualGrant.completedYears,3);
  assert.equal(legal.entitlement.latestAnnualGrant.days,16);
});

test("under 80 percent attendance requires full-attendance month count",()=>{
  const pending=getAnnualLeaveLegalContext({...base,referenceDate:"2026-01-01",employmentStartDate:"2025-01-01",employmentStatus:"current",attendanceRatePercent:70,fullAttendanceMonthsPreviousYear:null});
  assert.equal(pending.entitlement.latestAnnualGrant.status,"needs_full_attendance_months");
  const calculated=getAnnualLeaveLegalContext({...base,referenceDate:"2026-01-01",employmentStartDate:"2025-01-01",employmentStatus:"current",attendanceRatePercent:70,fullAttendanceMonthsPreviousYear:8});
  assert.equal(calculated.entitlement.latestAnnualGrant.days,8);
});

test("unused allowance uses user-confirmed unused days and daily leave pay amount",()=>{
  const legal=getAnnualLeaveLegalContext({...base,referenceDate:"2026-08-16",employmentStartDate:"2024-01-01",employmentStatus:"current"});
  assert.equal(legal.money.potentialGross,500000);
  assert.equal(legal.money.outstandingEstimate,500000);
  assert.equal(legal.money.status,"estimated_no_use_promotion");
});

test("use promotion does not silently erase compensation without legal review",()=>{
  const legal=getAnnualLeaveLegalContext({...base,referenceDate:"2026-08-16",employmentStartDate:"2024-01-01",employmentStatus:"current",usePromotionImplemented:true});
  assert.equal(legal.money.potentialGross,500000);
  assert.equal(legal.money.outstandingEstimate,null);
  assert.equal(legal.money.status,"use_promotion_effect_needs_review");
});

test("weekly hours under 15 are excluded from article 60 baseline",()=>{
  const legal=getAnnualLeaveLegalContext({...base,referenceDate:"2026-08-16",employmentStartDate:"2025-01-01",employmentStatus:"current",averageWeeklyScheduledHours:14});
  assert.equal(legal.scope.eligible,false);
  assert.equal(legal.scope.status,"under_15_hours");
});

test("annual leave rule version changes at verified statutory effective dates",()=>{
  assert.equal(selectAnnualLeaveLegalVersion("2026-08-19").id,"lsa-annual-2020-03-31-baseline");
  assert.equal(selectAnnualLeaveLegalVersion("2026-08-20").id,"lsa-annual-2026-08-20");
  assert.equal(selectAnnualLeaveLegalVersion("2027-06-10").id,"lsa-annual-2027-06-10");
  assert.equal(selectAnnualLeaveLegalVersion("2019-12-31"),null);
});
