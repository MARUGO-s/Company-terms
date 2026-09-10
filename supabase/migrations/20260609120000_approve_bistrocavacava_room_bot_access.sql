-- ビストロ サヴァサヴァ（bistrocavacava）: 参加済みルームを Bot 利用承認する
--
-- 背景:
--   ビストロ サヴァサヴァの Bot が新しいルームに参加した。新規招待ルームは
--   auto_link_room.ts の既定で bot_access_approved = false のまま連携されるため、
--   承認するまでレシート・検索などの Bot 機能が停止する
--   （20260528140000_room_bot_access_approval.sql / ROOM-PERMISSION-DETAIL-GUIDE.md §7）。
--
-- 方針（冪等・店舗スコープ）:
--   bistrocavacava に連携された未承認ルームのみ bot_access_approved = true にする。
--   既に承認済みのルームや他店舗のルームには影響しない。

update public.room_summary_settings
set
  bot_access_approved = true,
  updated_at = now()
where receipt_report_store_partition_key = 'bistrocavacava'
  and bot_access_approved is distinct from true;
