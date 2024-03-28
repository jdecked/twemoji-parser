# Twemoji Parser

A simple library for identifying emoji entities within a string in order to render them as Twemoji.

For example, this parser is used within the rendering flow for Tweets and other text on [mobile.twitter.com](https://mobile.twitter.com)

## Setup

> [!IMPORTANT]
> The `twemoji-parser` package is now being published as `@twemoji/parser`

Add `@twemoji/parser` as a dependency to your project:

```sh
yarn add @twemoji/parser
```

Or, to work directly in this repo, clone it and run `yarn install` from the repo root.

## Usage

The [tests](src/__tests__/index.test.js) are intended to serve as a more exhaustive source of documentation, but the general idea is that the parser takes a string and returns an array of the emoji entities it finds:

```js
import { parse } from '@twemoji/parser';
const entities = parse('I 🧡 Twemoji! 🥳');
/*
entities = [
  {
    url: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f9e1.svg',
    indices: [ 2, 4 ],
    text: '🧡',
    type: 'emoji'
  },
  {
    url: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/1f973.svg',
    indices: [ 12, 14 ],
    text: '🥳',
    type: 'emoji'
  }
]
*/
```

## Authors

- Nathan Downs (ex-Twitter)
- Justine De Caires (ex-Twitter)

## Contributing

We feel that a welcoming community is important and we ask that you follow our
[Open Source Code of Conduct](CODE_OF_CONDUCT.md) in all interactions with the community.

## Support

Create a [new issue](https://github.com/jdecked/twemoji-parser/issues/new) on GitHub.

## License

MIT https://github.com/jdecked/twemoji-parser/blob/master/LICENSE.md
