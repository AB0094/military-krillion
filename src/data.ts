import type { Prompt } from './logic/types';
import raw from '../data/prompts.json';

/** All prompts come from data/prompts.json; nothing is hardcoded in the UI. */
export const PROMPTS = raw as Prompt[];
