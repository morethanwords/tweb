import type {ShareThemeBackdropOption} from '@layer';
import {DEFAULT_BACKDROP_NAME} from './colors';

/**
 * The colours the screen offers before the server's list has come, or when it is of no use: Android's built-in table
 * (`Backdrops.java`), in its sketch order. They have no server ids: each gets a local one below zero, which names it on
 * this screen and is never sent - a theme in one of them is saved once the server's list has come (`themeSaver`).
 */

// name, centre, edge, pattern, text
const TABLE: [string, number, number, number, number][] = [
  ['Rosewood', 0xB77A77, 0x814C52, 0x551C22, 0xEDCACD],
  ['Carmine', 0xE0574A, 0xA8383B, 0x4F0100, 0xFFB7AD],
  ['Fire Engine', 0xF05F4F, 0xC43949, 0x690009, 0xFFB7A6],
  ['Seal Brown', 0x664D45, 0x47362E, 0x0A0605, 0xD4BCB5],
  ['Chestnut', 0xBE6F54, 0x994838, 0x601508, 0xFEC6B9],
  ['Coral Red', 0xDA896B, 0xC4654F, 0x891200, 0xFFD9D2],
  ['Strawberry', 0xDD8E6F, 0xB75A60, 0xA90C0C, 0xFFD3D3],
  ['Chocolate', 0xA46E58, 0x74443B, 0x3E0A02, 0xE4B6AC],
  ['Mystic Pearl', 0xD08B6D, 0xB05770, 0x9B0526, 0xFEDDE0],
  ['Burnt Sienna', 0xD66F3C, 0xB54B2D, 0x6B0902, 0xFFCCB0],
  ['Tomato', 0xE6793E, 0xD44E3F, 0x800B00, 0xFFCCBD],
  ['Cappuccino', 0xB1907E, 0x7C6356, 0xEBD4C8, 0x4A3226],
  ['Copper', 0xD08656, 0x9D6531, 0x602901, 0xF4D8BE],
  ['Carrot Juice', 0xDB9867, 0xC76F4F, 0x8E2100, 0xFFD7CA],
  ['Persimmon', 0xE7A75A, 0xC5675F, 0xAD0E00, 0xFFE4D7],
  ['Desert Sand', 0xB39F82, 0x7E735B, 0x504429, 0xF2E5CD],
  ['Orange', 0xD19A3A, 0xC06F47, 0x9D3907, 0xFFE1C3],
  ['Caramel', 0xD09932, 0xB77431, 0x7D3600, 0xFFD9B3],
  ['Old Gold', 0xB58D38, 0x946925, 0x4F3302, 0xFFDD8C],
  ['Mustard', 0xD4980D, 0xC47712, 0x7A2500, 0xFFDE9C],
  ['Satin Gold', 0xBF9B47, 0x8D7739, 0x5D3B00, 0xFEE4A9],
  ['Amber', 0xDAB345, 0xB1802A, 0x7A3100, 0xFFEDC7],
  ['Pure Gold', 0xCCAB41, 0x987B32, 0x703C00, 0xFFE5AB],
  ['Light Olive', 0xC2AF64, 0x887E45, 0x594C04, 0xF5EBBC],
  ['Khaki Green', 0xADB070, 0x6B7D54, 0x39501B, 0xD3E6BB],
  ['Lemongrass', 0xAEB85A, 0x559345, 0x466A07, 0xD8F2C2],
  ['Malachite', 0x95B457, 0x3D9755, 0x046B06, 0xC2EFBE],
  ['Camo Green', 0x75944D, 0x547341, 0x163701, 0xCFE8B9],
  ['Pistachio', 0x97B07C, 0x5C814C, 0x28471B, 0xD9F2C9],
  ['Shamrock Green', 0x8AB163, 0x559345, 0x126B00, 0xD5FBC8],
  ['Dark Green', 0x516341, 0x2B452F, 0x000501, 0xBFD1A9],
  ['Ranger Green', 0x5F7849, 0x3C4F3B, 0x102209, 0xB7C4B5],
  ['Hunter Green', 0x8FAE78, 0x4B825B, 0x1C491F, 0xD8F5DE],
  ['Mint Green', 0x7ECB82, 0x459E5A, 0x026B22, 0xBDFFCC],
  ['Emerald', 0x78C585, 0x42A171, 0x006532, 0xB9F9D9],
  ['Pine Green', 0x6BA97C, 0x3E7970, 0x0B4833, 0xD8F5E5],
  ['Gunship Green', 0x558A65, 0x3D6657, 0x07261D, 0xB5E0D4],
  ['Pacific Green', 0x6FC793, 0x3B9C84, 0x006149, 0xC6FFF0],
  ['Tactical Pine', 0x44826B, 0x2F6369, 0x002624, 0xB7E6D3],
  ['Jade Green', 0x55C49C, 0x3B9977, 0x044931, 0xBEFEE7],
  ['Aquamarine', 0x60B195, 0x46ABB4, 0x035F67, 0xC7FDFE],
  ['Pacific Cyan', 0x5ABEA6, 0x3D95BA, 0x02648D, 0xB6EFFF],
  ['Deep Cyan', 0x31B5AA, 0x189599, 0x004F4F, 0xD1FFFD],
  ['Turquoise', 0x5EC0B8, 0x3D928E, 0x11534C, 0xBDF8F2],
  ['Moonstone', 0x7EB1B4, 0x588390, 0x164552, 0xDAF5FD],
  ['Sky Blue', 0x58B4C8, 0x538BC2, 0x07609B, 0xCDE8FD],
  ['Azure Blue', 0x5DB1CB, 0x448BAB, 0x025074, 0xB5ECFF],
  ['Gunmetal', 0x4C5D63, 0x2F3B42, 0x04080A, 0xB6C5CC],
  ['Celtic Blue', 0x45B8ED, 0x3886D9, 0x003E85, 0xC2E7FF],
  ['Sapphire', 0x58A3C8, 0x5379C2, 0x0D45B6, 0xC1DEFF],
  ['Silver Blue', 0x80A4B8, 0x607C91, 0x15374B, 0xC9E4F4],
  ['Indigo Dye', 0x537991, 0x416479, 0x031B29, 0xC2DCEE],
  ['French Blue', 0x5C9BC4, 0x37739A, 0x073B5C, 0xC1E3F9],
  ['Navy Blue', 0x6C9EDD, 0x5C6EC9, 0x1239A2, 0xD3E1FF],
  ['Cobalt Blue', 0x6088CF, 0x5162B8, 0x13247C, 0xC2D3F5],
  ['Marine Blue', 0x4E689C, 0x3B4B7A, 0x010821, 0xBBCBF2],
  ['Midnight Blue', 0x5C6985, 0x354057, 0x030A18, 0xBFCCE0],
  ['Neon Blue', 0x7596F9, 0x6862E4, 0x2828BC, 0xCFDDFF],
  ['Cyberpunk', 0x858FF3, 0x865FD3, 0x4318A6, 0xE0D9FF],
  ['Electric Indigo', 0xA980F3, 0x5B62D8, 0x3722AB, 0xD8D8FF],
  ['Lavender', 0xB789E4, 0x8A5ABC, 0x5B10AB, 0xE8D1FF],
  ['Grape', 0x9D74C1, 0x794DA0, 0x3E0A6B, 0xE0BDFE],
  ['French Violet', 0xC260E6, 0x914ED9, 0x4A018A, 0xEBC7FF],
  ['English Violet', 0xB186BB, 0x875A91, 0x54225F, 0xE6C7ED],
  ['Purple', 0xAE6CAE, 0x844784, 0x470C47, 0xF3CBF3],
  ['Electric Purple', 0xCA70C6, 0x9662D4, 0x620FB4, 0xEBCEFF],
  ['Dark Lilac', 0xB17DA5, 0x8C577A, 0x652852, 0xF0C4E2],
  ['Fandango', 0xE28AB6, 0xA4588B, 0x8E054E, 0xFFC7EB],
  ['Mexican Pink', 0xE36692, 0xC9497C, 0x750230, 0xFFD6E6],
  ['Burgundy', 0xA35E66, 0x6D414A, 0x340307, 0xE7BCC0],
  ['Raspberry', 0xE07B85, 0xB65980, 0x890638, 0xFFD6E6],
  ['Black', 0x363738, 0x0E0F0F, 0x6C6868, 0x8C8F91],
  ['Onyx Black', 0x464A4D, 0x282C2E, 0x000000, 0x9EA1A2],
  ['Rifle Green', 0x64695C, 0x4B5241, 0x0F120B, 0xC3C7BD],
  ['Battleship Grey', 0x8C8C85, 0x6C6C66, 0x2B2A20, 0xCFCEC4],
  ['Feldgrau', 0x899288, 0x5E6B63, 0x1C261F, 0xDEE9E1],
  ['Steel Grey', 0x97A2AC, 0x63727C, 0x334552, 0xDFE4E8],
  ['Roman Silver', 0xA3A8B5, 0x7C808A, 0x3F4550, 0xDADFE2],
  ['Platinum', 0xB2AEA7, 0x88847E, 0x3D382D, 0xE9E7E2],
  ['Ivory White', 0xBAB6B1, 0xA19D97, 0x665F52, 0xF5F4F2]
];

// the order the table is shown in (`Backdrops.SKETCH_ORDER`); a served list keeps its own
const SKETCH_ORDER = [
  'Black', 'Onyx Black', 'Gunmetal', 'Midnight Blue', 'Steel Grey', 'Roman Silver', 'Raspberry', 'Carmine', 'Fire Engine',
  'Burnt Sienna', 'Tomato', 'Copper', 'Persimmon', 'Orange', 'Caramel', 'Mustard', 'Old Gold', 'Satin Gold', 'Amber',
  'Pure Gold', 'Lemongrass', 'Malachite', 'Shamrock Green', 'Mint Green', 'Emerald', 'Pacific Green', 'Jade Green',
  'Deep Cyan', 'Celtic Blue', 'Cobalt Blue', 'Neon Blue', 'Cyberpunk', 'Electric Indigo', 'Lavender', 'Grape',
  'French Violet', 'Purple', 'Electric Purple', 'Fandango', 'Mexican Pink', 'Burgundy', 'Rosewood', 'Chestnut',
  'Coral Red', 'Strawberry', 'Mystic Pearl', 'Carrot Juice', 'Light Olive', 'Khaki Green', 'Camo Green', 'Pistachio',
  'Hunter Green', 'Pine Green', 'Gunship Green', 'Tactical Pine', 'Aquamarine', 'Pacific Cyan', 'Turquoise', 'Moonstone',
  'Sky Blue', 'Azure Blue', 'Sapphire', 'Silver Blue', 'Indigo Dye', 'French Blue', 'Navy Blue', 'English Violet',
  'Dark Lilac', 'Seal Brown', 'Chocolate', 'Cappuccino', 'Desert Sand', 'Dark Green', 'Ranger Green', 'Marine Blue',
  'Ivory White', 'Platinum', 'Battleship Grey', 'Rifle Green', 'Feldgrau'
];

export const BUILT_IN_BACKDROPS: ShareThemeBackdropOption[] = TABLE
.map(([name, center_color, edge_color, pattern_color, text_color], index): ShareThemeBackdropOption => ({
  _: 'shareThemeBackdropOption',
  backdrop_id: -(index + 1),
  name,
  center_color,
  edge_color,
  pattern_color,
  text_color
}))
.sort((a, b) => SKETCH_ORDER.indexOf(a.name) - SKETCH_ORDER.indexOf(b.name));

/** A local id of the built-in table: what it names cannot be sent */
export const isBuiltInBackdropId = (id: number | undefined) => id !== undefined && id < 0;

/**
 * The colours to offer: the served list, unless it has not come or lacks the default one (`Backdrops.apply` turns such
 * a list down), when the built-in table stands in.
 */
export function usableBackdrops(served: ShareThemeBackdropOption[] | undefined) {
  return served?.some((option) => option.name === DEFAULT_BACKDROP_NAME) ? served : BUILT_IN_BACKDROPS;
}
