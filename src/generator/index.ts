import { promises as fsp } from 'node:fs';
import { generateRegexView } from './generator.js';
import Mustache from 'mustache';
import { resolve } from 'node:path';

/* eslint-disable no-console */

async function generateEmojiRegex(): Promise<void> {
  const configPath = resolve(__dirname, './config/emoji.yml');
  const templatePath = resolve(__dirname, './regex.js.mustache');
  const outputPath = resolve(__dirname, '../lib/regex.js');

  console.log(`Loading config from ${configPath}...`);
  const yamlContent = await fsp.readFile(configPath, 'utf8');

  console.log('Generating view...');
  const view = generateRegexView(yamlContent);

  console.log(`Loading template from ${templatePath}...`);
  const templateContent = await fsp.readFile(templatePath, 'utf8');

  console.log('Rendering template...');
  const renderedContent = Mustache.render(templateContent, view);

  console.log(`Writing output to ${outputPath}...`);
  const parentDir = resolve(outputPath, '..');
  await fsp.mkdir(parentDir, { recursive: true });
  await fsp.writeFile(outputPath, renderedContent, 'utf8');

  console.log('Done!');
}

generateEmojiRegex().catch((error) => {
  console.error('Error generating emoji regex:', error);
  process.exit(1);
});
