// /admin/base-prices — 基準価格の編集画面 (04-api-contract.md §/admin/base-prices)
// ADMIN 専用。RoomType × Plan の組合せに対する amount / priceMin / priceMax を編集する。
// 試作段階では (RoomType, Plan) ごとに 1 行だけ保持し、履歴は残さない (ADR-0011)。

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AdminBasePricesListResponse } from '@app/shared';
import BasePricesTable from './_components/BasePricesTable';

export default async function AdminBasePricesPage() {
  const session = await auth();
  if (!session?.user) redirect('/signin');

  const subject = {
    id: session.user.userId,
    email: session.user.email ?? '',
    role: session.user.role,
  };

  let data: AdminBasePricesListResponse | null = null;
  let errorMsg: string | null = null;
  try {
    data = await apiFetch<AdminBasePricesListResponse>('/admin/base-prices', subject);
  } catch (e) {
    if (e instanceof ApiClientError) {
      errorMsg = e.message;
    } else {
      throw e;
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>基準価格</h1>
      <p
        role="note"
        style={{
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '0.375rem',
          color: '#78350f',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        <strong>注意:</strong>{' '}
        基準価格 (amount) と上下限 (priceMin / priceMax) は推奨価格計算に直接使われます。
        試作段階では (部屋タイプ, プラン) ごとに最新の 1 行のみ保持し、履歴は残しません
        (変更すると過去の effectiveFrom 行を上書きします)。
      </p>
      {errorMsg ? (
        <p role="alert" style={{ color: '#b00020' }}>
          {errorMsg}
        </p>
      ) : data ? (
        <BasePricesTable
          roomTypes={data.roomTypes}
          plans={data.plans}
          items={data.items}
        />
      ) : null}
    </div>
  );
}
