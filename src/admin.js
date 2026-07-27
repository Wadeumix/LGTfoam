const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');
const sheets = require('./sheets');
const { STAFF_ROLE_ID } = require('./config');

function isStaff(interaction) {
  if (!STAFF_ROLE_ID) return true; // 未設定の場合は本部鯖にいる全員を許可
  return interaction.member?.roles?.cache?.has(STAFF_ROLE_ID);
}

async function denyIfNotStaff(interaction) {
  if (isStaff(interaction)) return false;
  await interaction.reply({ content: '⛔ このパネルはスタッフ専用です。', ephemeral: true });
  return true;
}

function buildAdminPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('🛠 LGTレース管理パネル')
    .setDescription('下のボタンから名簿の検索・削除・TA記録の管理ができます（スタッフ専用）。')
    .setColor(0x34495e);
}

function buildAdminPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_search').setLabel('🔍 名簿検索').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('admin_delete').setLabel('🗑 レーサー削除').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('admin_ta_log').setLabel('🏆 TA記録管理').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin_stats').setLabel('📊 統計表示').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('admin_dupes').setLabel('🧭 重複チェック').setStyle(ButtonStyle.Secondary),
  );
}

async function sendAdminPanel(channel) {
  await channel.send({ embeds: [buildAdminPanelEmbed()], components: [buildAdminPanelRow()] });
}

const CONTENT_CHAR_BUDGET = 1850; // Discordのメッセージ本文上限2000文字に対する安全マージン

function formatEntryLine(r) {
  return `${r.racerId} | ${r.name} | ${r.phone} | ${r.team} | ${r.registeredAt}`;
}

/**
 * コピペしやすいよう、コードブロック付きの通常テキストメッセージとして一覧を組み立てる。
 * 文字数上限に収まる件数だけ表示し、超過分は件数のみ案内する。
 */
function buildRosterContent(title, rows) {
  const header = `**${title}**\n`;
  const fenceOverhead = 8; // ```` ``` ```` 前後 + 改行
  let used = header.length + fenceOverhead;
  const lines = [];

  for (const r of rows) {
    const line = formatEntryLine(r);
    if (used + line.length + 1 > CONTENT_CHAR_BUDGET) break;
    lines.push(line);
    used += line.length + 1;
  }

  const omitted = rows.length - lines.length;
  let content = `${header}\`\`\`\n${lines.join('\n')}\n\`\`\``;
  if (omitted > 0) {
    content += `\n…他${omitted}件（絞り込むと見つけやすくなります）`;
  }
  return content;
}

function buildRefineRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_search_refine').setLabel('🔍 絞り込む').setStyle(ButtonStyle.Primary),
  );
}

/**
 * 「🔍 名簿検索」ボタンを押した直後に表示する、全レーサー一覧。
 * コピペしやすいよう通常テキスト（コードブロック）で送信し、
 * その下の「絞り込む」ボタンから名前/レーサーIDでのフィルタに進める。
 */
async function showFullRoster(interaction) {
  const rows = await sheets.getAllEntryRows();

  if (!rows.length) {
    await interaction.reply({ content: 'まだ名簿にレーサーが登録されていません。', ephemeral: true });
    return;
  }

  const content = buildRosterContent(`📋 レーサー一覧（全${rows.length}名）`, rows);
  await interaction.reply({ content, components: [buildRefineRow()], ephemeral: true });
}

async function showSearchModal(interaction) {
  const modal = new ModalBuilder().setCustomId('admin_modal_search').setTitle('名簿検索');
  const input = new TextInputBuilder()
    .setCustomId('input_query')
    .setLabel('名前 または レーサーIDを入力')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleSearchSubmit(interaction) {
  const query = interaction.fields.getTextInputValue('input_query').trim();
  const results = await sheets.searchEntries(query);

  if (!results.length) {
    await interaction.reply({
      content: `「${query}」に一致するレーサーは見つかりませんでした。`,
      components: [buildRefineRow()],
      ephemeral: true,
    });
    return;
  }

  const content = buildRosterContent(`🔍 検索結果（${results.length}件）`, results);
  await interaction.reply({ content, components: [buildRefineRow()], ephemeral: true });
}

async function showDeleteModal(interaction) {
  const modal = new ModalBuilder().setCustomId('admin_modal_delete').setTitle('レーサー削除');
  const input = new TextInputBuilder()
    .setCustomId('input_racer_id')
    .setLabel('削除するレーサーID')
    .setPlaceholder('例: A0001')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleDeleteModalSubmit(interaction) {
  const racerId = interaction.fields.getTextInputValue('input_racer_id').trim();
  const results = await sheets.searchEntries(racerId);
  const target = results.find((r) => r.racerId === racerId);

  if (!target) {
    await interaction.reply({ content: `レーサーID「${racerId}」は名簿に見つかりませんでした。`, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚠️ 削除確認')
    .setDescription(
      `以下のレーサーを全ての名簿（エントリー名簿・全レーサー名簿・各レーサー情報・所属アカデミー）から削除します。よろしいですか？\n\n**${target.racerId}** ${target.name} / 所属: ${target.team}`,
    )
    .setColor(0xe74c3c);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_confirm_delete_${target.racerId}`)
      .setLabel('削除する')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('admin_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleConfirmDelete(interaction, racerId) {
  const ok = await sheets.deleteEntryByRacerId(racerId);
  if (ok) {
    await interaction.update({
      content: `🗑 レーサーID「${racerId}」を全ての名簿から削除しました。`,
      embeds: [],
      components: [],
    });
  } else {
    await interaction.update({
      content: `削除に失敗しました。レーサーID「${racerId}」が見つかりません（既に削除済みの可能性があります）。`,
      embeds: [],
      components: [],
    });
  }
}

async function handleCancel(interaction) {
  await interaction.update({ content: 'キャンセルしました。', embeds: [], components: [] });
}

async function showTaLogModal(interaction) {
  const modal = new ModalBuilder().setCustomId('admin_modal_ta_log').setTitle('TA記録の追加');
  const idInput = new TextInputBuilder()
    .setCustomId('input_racer_id')
    .setLabel('レーサーID')
    .setPlaceholder('例: A0001')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const logInput = new TextInputBuilder()
    .setCustomId('input_log')
    .setLabel('記録内容（タイム、結果、コメント等）')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(idInput),
    new ActionRowBuilder().addComponents(logInput),
  );
  await interaction.showModal(modal);
}

async function handleTaLogSubmit(interaction) {
  const racerId = interaction.fields.getTextInputValue('input_racer_id').trim();
  const logText = interaction.fields.getTextInputValue('input_log').trim();

  try {
    const result = await sheets.appendRaceLog(racerId, logText);
    const note = result.created ? '（各レーサー情報シートに新規作成しました）' : '';
    await interaction.reply({ content: `🏆 レーサーID「${racerId}」に記録を追加しました。${note}`, ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: `エラー: ${err.message}`, ephemeral: true });
  }
}

async function handleStats(interaction) {
  const stats = await sheets.getEntryStats();
  const teamLines = Object.entries(stats.teamCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([team, count]) => `・${team || '(未設定)'}: ${count}名`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📊 エントリー統計')
    .addFields(
      { name: '総エントリー数', value: `${stats.total}名`, inline: true },
      { name: '企業チーム所属', value: `${stats.companyCount}名`, inline: true },
      { name: 'アカデミー所属', value: `${stats.academyCount}名`, inline: true },
    )
    .setDescription(teamLines || '（データがありません）')
    .setColor(0x9b59b6);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * 名前+街の電話番号が同じレーサーをグループ表示する。
 * どちらを消すかはスタッフが判断し、🗑レーサー削除で対応する（自動削除はしない）。
 */
async function handleDupes(interaction) {
  const groups = await sheets.findDuplicateGroups();

  if (!groups.length) {
    await interaction.reply({ content: '✅ 重複しているレーサーは見つかりませんでした。', ephemeral: true });
    return;
  }

  const lines = [];
  groups.forEach((group, i) => {
    lines.push(`--- 重複グループ${i + 1} ---`);
    group.forEach((r) => lines.push(formatEntryLine(r)));
  });

  const header = `**🧭 重複チェック結果（${groups.length}組）**\n`;
  const content = `${header}\`\`\`\n${lines.join('\n')}\n\`\`\`\nどちらを残すか確認のうえ、🗑レーサー削除で古い方を消してください。`;

  await interaction.reply({ content, ephemeral: true });
}

async function handleAdminInteraction(interaction) {
  if (await denyIfNotStaff(interaction)) return true;

  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === 'admin_search') {
      await showFullRoster(interaction);
      return true;
    }
    if (id === 'admin_search_refine') {
      await showSearchModal(interaction);
      return true;
    }
    if (id === 'admin_delete') {
      await showDeleteModal(interaction);
      return true;
    }
    if (id === 'admin_ta_log') {
      await showTaLogModal(interaction);
      return true;
    }
    if (id === 'admin_stats') {
      await handleStats(interaction);
      return true;
    }
    if (id === 'admin_dupes') {
      await handleDupes(interaction);
      return true;
    }
    if (id.startsWith('admin_confirm_delete_')) {
      const racerId = id.replace('admin_confirm_delete_', '');
      await handleConfirmDelete(interaction, racerId);
      return true;
    }
    if (id === 'admin_cancel') {
      await handleCancel(interaction);
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    const id = interaction.customId;

    if (id === 'admin_modal_search') {
      await handleSearchSubmit(interaction);
      return true;
    }
    if (id === 'admin_modal_delete') {
      await handleDeleteModalSubmit(interaction);
      return true;
    }
    if (id === 'admin_modal_ta_log') {
      await handleTaLogSubmit(interaction);
      return true;
    }
  }

  return false;
}

module.exports = {
  sendAdminPanel,
  buildAdminPanelEmbed,
  buildAdminPanelRow,
  handleAdminInteraction,
};
