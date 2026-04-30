// GET /stats/* — 補助指標 (04-api-contract.md / 02-pricing-model.md)

import type { DecimalString } from './common.js';
import type { LeadTimeBin } from '../pricing/leadTimeBin.js';

export type YearMonth = `${number}-${number}`;

export interface StatsRangeRequest {
  from: YearMonth;
  to: YearMonth;
}

export type StatsOccupancyRequest = StatsRangeRequest;

export interface OccupancyItem {
  yearMonth: YearMonth;
  occupancyRate: DecimalString;
  soldRoomNights: number;
  totalRoomNights: number;
}

export interface StatsOccupancyResponse {
  items: OccupancyItem[];
}

export type StatsAdrRequest = StatsRangeRequest;

export interface AdrItem {
  yearMonth: YearMonth;
  adr: DecimalString;
  totalRevenue: DecimalString;
  soldRoomNights: number;
}

export interface StatsAdrResponse {
  items: AdrItem[];
}

export type StatsLeadTimeRequest = StatsRangeRequest;

export interface LeadTimeDistributionItem {
  bin: LeadTimeBin;
  count: number;
  share: DecimalString;
}

export interface StatsLeadTimeResponse {
  items: LeadTimeDistributionItem[];
}
