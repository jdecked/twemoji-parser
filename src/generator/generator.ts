import { load } from 'js-yaml';

// Unicode constants
export const SkinTones = [0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff];
export const RightDirectionalZwjSeq = [0x200d, 0x27a1, 0xfe0f];

export const KeycapCodePoint = 0x20e3;
export const ZwjCodePoint = 0x200d;
export const ManCodePoint = 0x1f468;
export const WomanCodePoint = 0x1f469;
export const PersonCodePoint = 0x1f9d1;
export const VS15CodePoint = 0xfe0e;
export const VS16CodePoint = 0xfe0f;
export const FemaleSignCodePoint = 0x2640;
export const MaleSignCodePoint = 0x2642;

export enum ZwjDiversityType {
    LeadingGender = 'LeadingGender',
    TrailingGenderWithoutVariant = 'TrailingGenderWithoutVariant',
    TrailingGenderWithVariant = 'TrailingGenderWithVariant',
}

export interface EmojiItem {
    codepoints: number[];
    emojiType: string;
    multiDiversityConfig?: {
        baseSame: string;
        baseDifferent: string;
        baseDifferentIsSorted: boolean;
    };
}

export function unicodePattern(v: number): string {
    if (v < 0xff) {
        return String.fromCodePoint(v);
    } else {
        const str = String.fromCodePoint(v);
        let res = '';
        for (let i = 0; i < str.length; i++) {
            res += '\\u' + str.charCodeAt(i).toString(16).padStart(4, '0');
        }
        return res;
    }
}

export function groupLastItemsByPrefix(seq: number[][]): Map<string, { prefix: number[]; lastItems: number[] }> {
    const groups = new Map<string, { prefix: number[]; lastItems: number[] }>();
    for (const item of seq) {
        if (item.length === 0) continue;
        const prefix = item.slice(0, -1);
        const lastItem = item[item.length - 1];
        const key = prefix.join(',');
        let group = groups.get(key);
        if (!group) {
            group = { prefix, lastItems: [] };
            groups.set(key, group);
        }
        group.lastItems.push(lastItem);
    }
    return groups;
}

export function findContiguousSpans(seq: number[]): [number, number][] {
    const sorted = [...seq].sort((a, b) => a - b);
    const spans: [number, number][] = [];
    for (const value of sorted) {
        if (spans.length > 0) {
            const lastSpan = spans[spans.length - 1];
            if (lastSpan[1] + 1 === value) {
                lastSpan[1] = value;
                continue;
            }
        }
        spans.push([value, value]);
    }
    return spans;
}

export function spanString(seq: [number, number][]): string {
    if (seq.length === 0) return '';
    if (seq.length === 1 && seq[0][0] === seq[0][1]) {
        return unicodePattern(seq[0][0]);
    }

    const mapped = seq.map(([start, end]) => {
        if (start === end) {
            return unicodePattern(start);
        } else if (start + 1 === end) {
            return unicodePattern(start) + unicodePattern(end);
        } else {
            return unicodePattern(start) + '-' + unicodePattern(end);
        }
    });
    return '[' + mapped.join('') + ']';
}

export function regexFromCodepointSequences(codePointSequences: number[][], isUCS2: boolean = true): string {
    if (codePointSequences.length === 0) return '';
    const normalized = isUCS2
        ? codePointSequences.map(codePointSequence => {
            const result: number[] = [];
            for (const codePoint of codePointSequence) {
                if (codePoint >= 0x10000 && codePoint < 0x110000) {
                    result.push(
                        Math.floor((codePoint - 0x10000) / 1024) + 0xd800,
                        (codePoint % 1024) + 0xdc00
                    );
                } else if (codePoint < 0x10000) {
                    result.push(codePoint);
                }
            }
            return result;
        })
        : codePointSequences;

    const groupedItems = groupLastItemsByPrefix(normalized);
    const sortedGroupedItems = Array.from(groupedItems.values()).sort((a, b) => {
        if (a.prefix.length !== b.prefix.length) {
            return b.prefix.length - a.prefix.length;
        }
        const strA = String.fromCodePoint(...a.prefix);
        const strB = String.fromCodePoint(...b.prefix);
        if (strA < strB) return -1;
        if (strA > strB) return 1;
        return 0;
    });

    const regexParts = sortedGroupedItems.map(group => {
        const joinedItems = group.prefix.map(v => unicodePattern(v));
        joinedItems.push(spanString(findContiguousSpans(group.lastItems)));
        return joinedItems.join('');
    });

    if (regexParts.length === 0) throw new Error('Regex cannot be empty');
    if (regexParts.length === 1 && sortedGroupedItems[0].prefix.length === 0) return regexParts[0];
    return '(?:' + regexParts.join('|') + ')';
}

export function getDiversitySequences(item: EmojiItem): number[][] {
    const { codepoints, emojiType, multiDiversityConfig } = item;

    const hasZeroWidthJoiner = codepoints.includes(ZwjCodePoint);
    const hasDirectionality = ['directional', 'directional,diversity'].includes(emojiType);

    if (['diversity', 'directional,diversity', 'variant,diversity'].includes(emojiType)) {
        const seqs: number[][] = [codepoints];
        for (const suffix of SkinTones) {
            let diversityCodepoints: number[];
            if (hasZeroWidthJoiner) {
                const firstZwjIndex = codepoints.indexOf(ZwjCodePoint);
                const before = codepoints.slice(0, firstZwjIndex);
                const after = codepoints.slice(firstZwjIndex);
                diversityCodepoints = [
                    ...before.filter(v => v !== VS16CodePoint),
                    suffix,
                    ...after
                ];
            } else {
                diversityCodepoints = [...codepoints, suffix];
            }

            if (hasDirectionality) {
                seqs.push(
                    diversityCodepoints,
                    [...diversityCodepoints, ...RightDirectionalZwjSeq]
                );
            } else {
                seqs.push(diversityCodepoints);
            }
        }
        return seqs;
    } else if (emojiType === 'multi-diversity') {
        if (!multiDiversityConfig) {
            throw new Error(
                `Emoji ${codepoints.map(v => v.toString(16)).join('-')} which is multi-diversity type is missing a MultiDiversityConfig`
            );
        }
        const config = multiDiversityConfig;
        const seqs: number[][] = [codepoints];

        const revSkinTones = [...SkinTones].reverse();
        for (const firstTone of revSkinTones) {
            for (const secondTone of revSkinTones) {
                let diversityCodepoints: number[];
                if (firstTone === secondTone && config.baseSame !== config.baseDifferent) {
                    diversityCodepoints = config.baseSame.split('-').map(cp => {
                        if (cp === 'skintone') return firstTone;
                        return parseInt(cp, 16);
                    });
                } else {
                    let usedFirst = false;
                    diversityCodepoints = config.baseDifferent.split('-').map(cp => {
                        if (cp === 'skintone') {
                            if (usedFirst) return secondTone;
                            usedFirst = true;
                            return firstTone;
                        }
                        return parseInt(cp, 16);
                    });
                }

                if (hasDirectionality) {
                    seqs.push(
                        diversityCodepoints,
                        [...diversityCodepoints, ...RightDirectionalZwjSeq]
                    );
                } else {
                    seqs.push(diversityCodepoints);
                }
            }
        }
        return seqs;
    } else {
        return [codepoints];
    }
}

export function generateRegexView(yamlContent: string): Record<string, string> {
    const categories = load(yamlContent) as any[];
    const emojiItems: EmojiItem[] = [];

    for (const cat of categories) {
        if (!cat.items) continue;
        for (const item of cat.items) {
            const codepoints = item.unicode.split('-').map((v: string) => parseInt(v, 16));
            let emojiType = item.type || 'normal';

            let multiDiversityConfig;
            if (emojiType === 'multi-diversity') {
                multiDiversityConfig = {
                    baseSame: item.multi_diversity_base_same || '',
                    baseDifferent: item.multi_diversity_base_different || '',
                    baseDifferentIsSorted: !!item.multi_diversity_base_different_is_sorted,
                };
            }

            emojiItems.push({
                codepoints,
                emojiType,
                multiDiversityConfig,
            });
        }
    }

    const multiDiversityItems = emojiItems.filter(v => v.emojiType === 'multi-diversity');
    const nonMultiDiversityItems = emojiItems.filter(v => v.emojiType !== 'multi-diversity');
    const zwjItems = nonMultiDiversityItems.filter(v => v.codepoints.includes(ZwjCodePoint));
    const nonZwjItems = nonMultiDiversityItems.filter(v => !v.codepoints.includes(ZwjCodePoint));

    const zwjDiversityItems = zwjItems.filter(
        item => item.emojiType === 'diversity' || item.emojiType === 'directional,diversity'
    );
    const zwjNonDiversityItems = zwjItems.filter(
        item => item.emojiType !== 'diversity' && item.emojiType !== 'directional,diversity'
    );

    // Validate zwjItems
    for (const item of zwjItems) {
        if (
            item.emojiType !== 'normal' &&
            item.emojiType !== 'directional' &&
            item.emojiType !== 'diversity' &&
            item.emojiType !== 'directional,diversity'
        ) {
            throw new Error(
                `Zwj item ${item.codepoints.map(v => v.toString(16)).join('-')} has an invalid type (${item.emojiType}). Only directional, diversity, or directional diversity are allowed.`
            );
        }
    }

    const arrayEqual = (a: number[], b: number[]): boolean => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    };

    const verifyGenderComplementExists = (genderComplementCodepoints: number[], item: EmojiItem): void => {
        const exists = zwjDiversityItems.some(v => arrayEqual(v.codepoints, genderComplementCodepoints));
        if (!exists) {
            throw new Error(
                `Zwj diversity item ${item.codepoints.map(v => v.toString(16)).join('-')} is missing its gender-complement sequence ${genderComplementCodepoints.map(v => v.toString(16)).join('-')}`
            );
        }
    };

    const zwjDiversityBreakdown: { type: ZwjDiversityType; cp: number[] }[] = [];
    for (const item of zwjDiversityItems) {
        const cp = item.codepoints;
        if (cp.length >= 2 && cp[0] === ManCodePoint && cp[1] === ZwjCodePoint) {
            verifyGenderComplementExists([WomanCodePoint, ...cp.slice(1)], item);
            verifyGenderComplementExists([PersonCodePoint, ...cp.slice(1)], item);
        } else if (cp.length >= 2 && cp[0] === WomanCodePoint && cp[1] === ZwjCodePoint) {
            verifyGenderComplementExists([ManCodePoint, ...cp.slice(1)], item);
            verifyGenderComplementExists([PersonCodePoint, ...cp.slice(1)], item);
        } else if (cp.length >= 2 && cp[0] === PersonCodePoint && cp[1] === ZwjCodePoint) {
            zwjDiversityBreakdown.push({ type: ZwjDiversityType.LeadingGender, cp: cp.slice(2) });
        } else if (
            cp.length >= 4 &&
            arrayEqual(cp.slice(-4), [VS16CodePoint, ZwjCodePoint, MaleSignCodePoint, VS16CodePoint])
        ) {
            verifyGenderComplementExists([...cp.slice(0, -2), FemaleSignCodePoint, VS16CodePoint], item);
            zwjDiversityBreakdown.push({ type: ZwjDiversityType.TrailingGenderWithVariant, cp: cp.slice(0, -4) });
        } else if (
            cp.length >= 4 &&
            arrayEqual(cp.slice(-4), [VS16CodePoint, ZwjCodePoint, FemaleSignCodePoint, VS16CodePoint])
        ) {
            verifyGenderComplementExists([...cp.slice(0, -2), MaleSignCodePoint, VS16CodePoint], item);
        } else if (
            cp.length >= 3 &&
            arrayEqual(cp.slice(-3), [ZwjCodePoint, MaleSignCodePoint, VS16CodePoint])
        ) {
            verifyGenderComplementExists([...cp.slice(0, -2), FemaleSignCodePoint, VS16CodePoint], item);
            zwjDiversityBreakdown.push({ type: ZwjDiversityType.TrailingGenderWithoutVariant, cp: cp.slice(0, -3) });
        } else if (
            cp.length >= 3 &&
            arrayEqual(cp.slice(-3), [ZwjCodePoint, FemaleSignCodePoint, VS16CodePoint])
        ) {
            verifyGenderComplementExists([...cp.slice(0, -2), MaleSignCodePoint, VS16CodePoint], item);
        } else {
            throw new Error(
                `Zwj diversity item ${item.codepoints.map(v => v.toString(16)).join('-')} needs to be in a pair of leading or trailing genders`
            );
        }
    }

    const codePointSequencesByZwjDiversityType = (typeNeeded: ZwjDiversityType): number[][] => {
        return zwjDiversityBreakdown.filter(v => v.type === typeNeeded).map(v => v.cp);
    };

    const codePointSequencesByType = (emojiType: string): number[][] => {
        return nonZwjItems.filter(v => v.emojiType === emojiType).map(v => v.codepoints);
    };

    const keycap = unicodePattern(KeycapCodePoint);
    const zwj = unicodePattern(ZwjCodePoint);
    const vs15 = unicodePattern(VS15CodePoint);
    const vs16 = unicodePattern(VS16CodePoint);

    // Build skinToneCodePointSequences: [[0x1f3fb], ..., [0x1f3ff]]
    const skinToneCodePointSequences = SkinTones.map(v => [v]);

    const skinToneRegex = regexFromCodepointSequences(skinToneCodePointSequences);
    const skinToneOrVs16Regex = regexFromCodepointSequences([
        [VS16CodePoint],
        ...skinToneCodePointSequences,
    ]);
    const femaleOrMaleSignRegex = regexFromCodepointSequences([
        [FemaleSignCodePoint],
        [MaleSignCodePoint],
    ]);
    const manWomanPersonRegex = regexFromCodepointSequences([
        [ManCodePoint],
        [WomanCodePoint],
        [PersonCodePoint],
    ]);
    const rightDirectionalZwjSeqRegex = regexFromCodepointSequences([
        RightDirectionalZwjSeq,
    ]);

    const zwjLeadingGenderRegex = regexFromCodepointSequences(
        codePointSequencesByZwjDiversityType(ZwjDiversityType.LeadingGender)
    );

    const zwjTrailingGenderWithVariantRegex = regexFromCodepointSequences(
        codePointSequencesByZwjDiversityType(ZwjDiversityType.TrailingGenderWithVariant)
    );

    const zwjTrailingGenderWithoutVariantRegex = regexFromCodepointSequences(
        codePointSequencesByZwjDiversityType(ZwjDiversityType.TrailingGenderWithoutVariant)
    );

    const zwjRegex = regexFromCodepointSequences(zwjNonDiversityItems.map(v => v.codepoints));

    const keycapPrefixRegex = regexFromCodepointSequences(
        codePointSequencesByType('keycap').map(cp => cp.filter(v => v !== KeycapCodePoint))
    );

    const variantRegex = regexFromCodepointSequences(codePointSequencesByType('variant'));

    const textDefaultRegex = regexFromCodepointSequences(codePointSequencesByType('text-default'));

    const diversityRegex = regexFromCodepointSequences(codePointSequencesByType('diversity'));

    const variantDiversityRegex = regexFromCodepointSequences(codePointSequencesByType('variant,diversity'));

    const directionalDiversityRegex = regexFromCodepointSequences(
        codePointSequencesByType('directional,diversity')
    );

    const normalRegex = regexFromCodepointSequences([
        ...codePointSequencesByType('flag'),
        ...codePointSequencesByType('regional'),
        ...codePointSequencesByType('normal'),
    ]);

    const multiDiversityCodepointSequences = multiDiversityItems
        .flatMap(item => getDiversitySequences(item));

    const multiDiversityRegex = regexFromCodepointSequences(multiDiversityCodepointSequences);

    return {
        keycap,
        zwj,
        vs15,
        vs16,
        skinToneRegex,
        skinToneOrVs16Regex,
        femaleOrMaleSignRegex,
        manWomanPersonRegex,
        rightDirectionalZwjSeqRegex,
        zwjLeadingGenderRegex,
        zwjTrailingGenderWithVariantRegex,
        zwjTrailingGenderWithoutVariantRegex,
        zwjRegex,
        keycapPrefixRegex,
        variantRegex,
        textDefaultRegex,
        diversityRegex,
        variantDiversityRegex,
        directionalDiversityRegex,
        normalRegex,
        multiDiversityRegex,
    };
}
