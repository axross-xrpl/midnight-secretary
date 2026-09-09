import { Hotel, Plane, Ticket, TrainFront, Utensils } from "lucide-react";
import type { ServiceCategory } from "@/features/services/constants";

/**
 * 種別のアイコン
 *
 * 一覧の行と詳細の見出しで同じ絵を使うため、1か所に置く
 */
export const categoryIcons = {
  rail: TrainFront,
  air: Plane,
  hotel: Hotel,
  restaurant: Utensils,
  leisure: Ticket,
} satisfies Record<ServiceCategory, typeof TrainFront>;
