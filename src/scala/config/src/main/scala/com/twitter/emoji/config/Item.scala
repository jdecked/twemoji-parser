package com.twitter.emoji.config

import com.twitter.emoji.config.EmojiType._
import com.twitter.emoji.config.YamlParser.{
  SkinTones,
  VS16,
  Zwj,
  RightDirectionalZwjSeq
}
import com.twitter.emoji.config.Utils.{escapeForJs, escapeForScala}

case class SpritePosition(
    val spriteXPosition: Int,
    val spriteYPosition: Int
)

case class DirectionalVariant(
    text: String,
    directionalCodepoints: Seq[String] = Seq("default"),
    spritePosition: SpritePosition
)

case class SkinToneVariant(
    text: String,
    diversityCodepoints: Seq[String] = Seq("default"),
    spritePosition: SpritePosition
)

case class MultiDiversityConfig(
    baseSame: String,
    baseDifferent: String,
    baseDifferentIsSorted: Boolean
)

case class Item(
    codepoints: CodePoints,
    description: String,
    emojiType: EmojiType.Value,
    excludeFromPicker: Boolean = false,
    keywords: Option[String] = None,
    spritePosition: Option[SpritePosition] = None,
    directionalVariants: Seq[DirectionalVariant] = Seq(),
    skinToneVariants: Seq[SkinToneVariant] = Seq(),
    multiDiversityConfig: Option[MultiDiversityConfig] = None
) {
  val hasZeroWidthJoiner: Boolean = codepoints.cp.contains(Zwj)

  // Directionality refers to right or left directionality, denoted by the
  // relevant ZWJ sequences at the end of a codepoint sequence.
  // See https://unicode.org/reports/tr51/#Direction for more info.
  val hasDirectionality: Boolean =
    EmojiType.DirectionalTypes.contains(emojiType)

  val hasDiversity = EmojiType.DiversityTypes.contains(emojiType)
  // "diversity" in this context currently equates to the application of
  // skin-tone modifiers to emoji that support them per the Unicode/Emoji specs.
  val diversitySequences: Seq[CodePoints] =
    if (EmojiType.SingleDiversityTypes.contains(emojiType)) {
      codepoints +: SkinTones.flatMap { suffix =>
        val diversityCodepoints =
          if (hasZeroWidthJoiner) {
            val firstZwjIndex = codepoints.cp.indexOf(Zwj)
            val (before, after) = codepoints.cp.splitAt(firstZwjIndex)
            CodePoints(before.filter(_ != VS16) ++ (suffix +: after))
          } else {
            CodePoints(codepoints.cp :+ suffix)
          }

        if (hasDirectionality) {
          Seq(diversityCodepoints,
              CodePoints(
                diversityCodepoints.cp ++: RightDirectionalZwjSeq
              ))
        } else {
          Seq(diversityCodepoints)
        }
      }
    } else if (emojiType == EmojiType.MultiDiversity) {
      val config = multiDiversityConfig.getOrElse(
        throw new Exception(
          s"Emoji ${codepoints.key} which is multi-diversity type is missing a MultiDiversityConfig")
      )

      Seq(codepoints) ++ (
        SkinTones.reverse.flatMap { firstTone =>
          SkinTones.reverse.flatMap {
            secondTone =>
              val diversityCodepoints =
                if (firstTone == secondTone && config.baseSame != config.baseDifferent) {
                  CodePoints(config.baseSame.split('-').map { cp =>
                    if (cp == "skintone") firstTone
                    else Integer.parseInt(cp, 16)
                  })
                } else {
                  var usedFirst = false
                  val includeInPicker = firstTone >= secondTone || !config.baseDifferentIsSorted

                  CodePoints(
                    config.baseDifferent.split('-').map { cp =>
                      if (cp == "skintone") {
                        if (usedFirst) secondTone
                        else {
                          usedFirst = true
                          firstTone
                        }
                      } else Integer.parseInt(cp, 16)
                    },
                    includeInPicker
                  )
                }

              if (hasDirectionality) {
                Seq(diversityCodepoints,
                    CodePoints(
                      diversityCodepoints.cp ++: RightDirectionalZwjSeq,
                      diversityCodepoints.includeInPicker
                    ))
              } else {
                Seq(diversityCodepoints)
              }
          }
        }
      )
    } else {
      Seq(codepoints)
    }

  val key = codepoints.key

  val text = Item.getFullyQualifiedEmojiText(emojiType, codepoints)

  val escapedDescriptionForScala = escapeForScala(description)

  val escapedDescriptionForJs = escapeForJs(description)

  val escapedKeywordsForJs = keywords.map(escapeForJs(_))

  // Some EmojiTypes allow for modifiers, e.g. Diversity emoji allow for an optional Skin Tone
  // modifier codepoint. To determine the max codepoint sequence length for most emoji types, we
  // add the length of the base codepoint sequence to the number of modifiers allowed by its
  // type. Codepoint modifiers are as follows:
  //   Variant: VS16 (exactly U+fe0f)
  //   Directional: right directional sequence (exactly U+200d U+2640 U+fe0f)
  //   Diversity: one Skin Tone (one of U+1f3f[b-f])
  //   DirectionalDiversity: one Skin Tone (one of U+1f3f[b-f]) and right directional sequence (exactly U+200d U+2640 U+fe0f)
  //   TextDefault: VS16 (exactly U+fe0f)
  //   VariantDiversity: VS16 (exactly U+fe0f) and one Skin Tone (one of U+1f3f[b-f])
  //
  // In the case of MultiDiversity codepoints, we take the max sequence length of all the
  // diversityCodepoints, which should enumerate all recognized sequences for the emoji group
  // (including the base sequence).
  val maxCodePointSequenceLength = emojiType match {
    case Normal | Keycap | Flag | Regional => codepoints.cp.length
    case Variant | Diversity | TextDefault => codepoints.cp.length + 1
    case VariantDiversity                  => codepoints.cp.length + 2
    case Directional                       => codepoints.cp.length + 3
    case DirectionalDiversity              => codepoints.cp.length + 4
    case EmojiType.MultiDiversity          => diversitySequences.map(_.cp.length).max
  }
}

object Item {
  def apply(item: Item, emojiSpritePositions: Map[String, (Int, Int)]): Item = {
    val defaultSpritePosition = emojiSpritePositions
      .get(item.key)
      .map(spritePos => SpritePosition(spritePos._1, spritePos._2))
    val directionalVariants =
      if (item.hasDirectionality) {
        val rightDirectionalCp = CodePoints(
          item.codepoints.cp ++: RightDirectionalZwjSeq)
        val spritePosition =
          emojiSpritePositions.getOrElse(rightDirectionalCp.key, (0, 0))
        val text = getFullyQualifiedEmojiText(
          item.emojiType,
          rightDirectionalCp
        )
        Seq(
          DirectionalVariant(
            text,
            rightDirectionalCp.cp.map(Integer.toHexString),
            SpritePosition(spritePosition._1, spritePosition._2)
          ))
      } else {
        Seq()
      }
    val skinToneVariants = item.diversitySequences
      .slice(1, item.diversitySequences.length)
      .filter(_.includeInPicker)
      .map { diversityCodepoints =>
        val spritePosition =
          emojiSpritePositions.getOrElse(diversityCodepoints.key, (0, 0))
        val skintoneSeq = diversityCodepoints.cp
          .filter(SkinTones.contains)
          .map(Integer.toHexString)
        val text =
          getFullyQualifiedEmojiText(item.emojiType, diversityCodepoints)
        SkinToneVariant(text,
                        skintoneSeq,
                        SpritePosition(spritePosition._1, spritePosition._2))
      }

    new Item(
      item.codepoints,
      item.description,
      item.emojiType,
      item.excludeFromPicker,
      item.keywords,
      defaultSpritePosition,
      directionalVariants,
      skinToneVariants,
      item.multiDiversityConfig
    )
  }

  def getFullyQualifiedEmojiText(emojiType: EmojiType.Value,
                                 codepoints: CodePoints): String = {
    if ((EmojiType.VariantTypes ++ Seq(EmojiType.TextDefault))
          .contains(emojiType)) {
      CodePoints(
        codepoints.cp
          .takeWhile(!SkinTones.contains(_)) ++ Seq(VS16) ++ codepoints.cp.find(
          SkinTones.contains)).str
    } else {
      codepoints.str
    }
  }
}
