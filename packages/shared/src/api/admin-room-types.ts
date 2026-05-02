// GET /admin/room-types, PATCH /admin/room-types/:id (issue #59 §D / 04-api-contract.md)
// - 編集できるのは inventoryCount のみ。capacity / name / code は対象外。
// - 部屋タイプの追加・削除は不可 (編集のみ)。

export interface AdminRoomType {
  id: number;
  code: string;
  name: string;
  capacity: number | null;
  inventoryCount: number;
}

export interface AdminRoomTypesListResponse {
  items: AdminRoomType[];
}

export interface AdminRoomTypeUpdateRequest {
  inventoryCount: number;
}

export type AdminRoomTypeUpdateResponse = AdminRoomType;
