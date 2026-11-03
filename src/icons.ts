/* Icons for element types, kept apart from the model so the server can share it. */
import {
  Box, CircleDot, ClipboardList, CodeXml, Columns3, Container, Database, Film, Heading, Image, LayoutGrid, Link, List, Minus,
  PanelTop, Pilcrow, Quote, RectangleHorizontal, Send, Square, StretchHorizontal, TextCursorInput, TextQuote, Type, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  body: Square, section: PanelTop, container: Container, div: Square, flex: StretchHorizontal, grid: LayoutGrid, columns: Columns3,
  heading: Heading, paragraph: Pilcrow, textblock: Type, link: Link, button: RectangleHorizontal, quote: Quote, list: List,
  listitem: CircleDot, divider: Minus, image: Image, video: Film, embed: CodeXml, form: ClipboardList, input: TextCursorInput,
  textarea: TextQuote, formbutton: Send, collectionlist: Database, collectionitem: Square, symbol: Box,
};

export const iconFor = (type: string): LucideIcon => ICONS[type] || Square;
