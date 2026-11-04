/* Icons for element types, kept apart from the model so the server can share it. */
import {
  Box, CircleDot, ClipboardList, CodeXml, Columns3, Container, Database, Film, Heading, Image, LayoutGrid, Link, List, Minus,
  PanelTop, Pilcrow, Quote, RectangleHorizontal, Send, Square, StretchHorizontal, TextCursorInput, TextQuote, Type, type LucideIcon,
  Accessibility, ChevronDown, ChevronRight, ChevronsUpDown, Clapperboard, CornerDownRight, EarOff, Expand, FileText, Folders, GalleryHorizontal,
  Link2, ListCollapse, MapPin, Menu, PanelsTopLeft, Rows2, SquareCheck, Star, Tag,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  body: Square, section: PanelTop, container: Container, div: Square, flex: StretchHorizontal, grid: LayoutGrid, columns: Columns3,
  heading: Heading, paragraph: Pilcrow, textblock: Type, link: Link, button: RectangleHorizontal, quote: Quote, list: List,
  listitem: CircleDot, divider: Minus, image: Image, video: Film, embed: CodeXml, form: ClipboardList, input: TextCursorInput,
  textarea: TextQuote, formbutton: Send, collectionlist: Database, collectionitem: Square, symbol: Box,
  linkblock: Link2, main: PanelsTopLeft, richtext: FileText, label: Tag, select: ChevronsUpDown, checkbox: SquareCheck, radio: CircleDot,
  navbar: Menu, navmenu: Menu, navbutton: Menu, tabs: Folders, tabsmenu: Rows2, tablink: RectangleHorizontal, tabscontent: Square, tabpane: Square,
  accordion: ListCollapse, summary: ChevronRight, dropdown: ChevronDown, dropdownlist: List, slider: GalleryHorizontal, slidertrack: GalleryHorizontal,
  slide: Square, sliderarrow: ChevronRight, lightbox: Expand, map: MapPin, bgvideo: Clapperboard, icon: Star, skiplink: CornerDownRight,
  srtext: EarOff, a11ywidget: Accessibility,
};

export const iconFor = (type: string): LucideIcon => ICONS[type] || Square;
