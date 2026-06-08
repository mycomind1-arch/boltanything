import { embed } from '../adapters/openai';

const EXPECTED_DIM = 768;

export async function embedText(text: string, _buildId?: string): Promise<number[]> {
  const vec = await embed(text);
  if (vec.length !== EXPECTED_DIM) {
    console.warn(`[embed] expected ${EXPECTED_DIM} dims, got ${vec.length}. Padding/truncating.`);
  }
  const result = vec.slice(0, EXPECTED_DIM);
  while (result.length < EXPECTED_DIM) result.push(0);
  return result;
}
