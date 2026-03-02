/**
 * Parse @mentions from text.
 * Matches patterns like @Mats, @"Mats Hansen", @rolle
 * Returns array of matched names.
 */
export function parseMentions(text: string): string[] {
  const mentions: string[] = [];
  // Match @"Name with spaces" or @SingleWord
  const regex = /@"([^"]+)"|@(\w{2,30})/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1] || match[2];
    if (name && !mentions.includes(name)) {
      mentions.push(name);
    }
  }
  return mentions;
}

/**
 * Resolve mention names to user IDs using the technicians table.
 */
export async function resolveMentionNames(
  supabase: any,
  names: string[]
): Promise<{ name: string; userId: string }[]> {
  if (names.length === 0) return [];
  
  const { data: technicians } = await supabase
    .from("technicians")
    .select("user_id, name")
    .not("user_id", "is", null);
  
  if (!technicians) return [];
  
  const resolved: { name: string; userId: string }[] = [];
  for (const mention of names) {
    const lower = mention.toLowerCase();
    const match = technicians.find((t: any) => 
      t.name?.toLowerCase() === lower ||
      t.name?.toLowerCase().startsWith(lower) ||
      t.name?.toLowerCase().includes(lower)
    );
    if (match?.user_id) {
      resolved.push({ name: mention, userId: match.user_id });
    }
  }
  return resolved;
}
