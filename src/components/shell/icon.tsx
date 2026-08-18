import * as React from "react";
import {
  Home, BookOpen, Library, FolderOpen, Calendar, Megaphone, Award, Users, Gauge, FileBarChart,
  Radar, TrendingUp, Contact, Store, GraduationCap, ClipboardList, Route, Rocket, Settings,
  Database, ScrollText, User, Bell, Search, LogOut, ChevronRight, ShieldCheck, Package, Upload,
  BadgeCheck, CalendarClock, Presentation, MessageSquare, Layers, FileSpreadsheet, Repeat, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home, "book-open": BookOpen, library: Library, "folder-open": FolderOpen, calendar: Calendar,
  megaphone: Megaphone, award: Award, users: Users, gauge: Gauge, "file-bar-chart": FileBarChart,
  radar: Radar, "trending-up": TrendingUp, contact: Contact, store: Store, "graduation-cap": GraduationCap,
  "clipboard-list": ClipboardList, route: Route, rocket: Rocket, settings: Settings, database: Database,
  "scroll-text": ScrollText, user: User, bell: Bell, search: Search, "log-out": LogOut,
  "chevron-right": ChevronRight, "shield-check": ShieldCheck, package: Package, upload: Upload,
  "badge-check": BadgeCheck, "calendar-clock": CalendarClock, presentation: Presentation,
  "message-square": MessageSquare, layers: Layers, "file-spreadsheet": FileSpreadsheet, repeat: Repeat,
};

export function NavIcon({ name, size = 17, className }: { name: string; size?: number; className?: string }) {
  const Icon = ICONS[name] ?? Layers;
  return <Icon size={size} className={className} aria-hidden />;
}
