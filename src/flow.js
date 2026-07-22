const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const session = require('./session');
const sheets = require('./sheets');
const { COMPANY_TEAMS, ACADEMIES, ACADEMY_TERMS, HQ_INVITE_URL } = require('./config');

const CHUNK_SIZE = 25; // Discordのセレクトメニューは1メニューにつき最大25選択肢

function buildCompanySelectRows() {
  const rows = [];
  for (let i = 0; i < COMPANY_TEAMS.length; i += CHUNK_SIZE) {
    const chunk = COMPANY_TEAMS.slice(i, i + CHUNK_SIZE);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`select_company_team_${i / CHUNK_SIZE}`)
      .setPlaceholder('所属している企業チームを選択してください')
      .addOptions(chunk.map((name) => ({ label: name, value: name })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  return rows;
}

function buildAcademySelectRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_academy')
    .setPlaceholder('入会したいアカデミーを選択してください')
    .addOptions(
      ACADEMIES.map((a) => ({ label: a.label, value: a.id })),
    );
  return new ActionRowBuilder().addComponents(menu);
}

async function askName_Phone(interaction) {
  const modal = new ModalBuilder().setCustomId('entry_modal_name_phone').setTitle('レーサーエントリー');

  const nameInput = new TextInputBuilder()
    .setCustomId('input_name')
    .setLabel('Q1. 名前')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const phoneInput = new TextInputBuilder()
    .setCustomId('input_phone')
    .setLabel('Q2. 街の電話番号')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const racingNameInput = new TextInputBuilder()
    .setCustomId('input_racing_name')
    .setLabel('レーシングタブレットのお名前')
    .setPlaceholder('/racing で登録されている名前を入力')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(phoneInput),
    new ActionRowBuilder().addComponents(racingNameInput),
  );

  await interaction.showModal(modal);
}

async function askQ3(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Q3. 貴方は既に企業チームに所属してますか？')
    .setColor(0x3498db);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('q3_yes').setLabel('はい').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('q3_no').setLabel('いいえ').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function askCompanyTeam(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('所属企業チームを選択してください')
    .setColor(0x3498db);
  await interaction.reply({ embeds: [embed], components: buildCompanySelectRows() });
}

async function askQ4(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Q4. アカデミー入会について')
    .setDescription(
      [
        'エントリーにはレースアカデミーに所属又は入会する必要があります。',
        '以下の規約に同意する者のみ入会が可能です。',
        '',
        `「${ACADEMY_TERMS}」`,
      ].join('\n'),
    )
    .setColor(0xf39c12);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('q4_agree').setLabel('同意').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('q4_disagree').setLabel('同意しない').setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function showQ4Disagree(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('エントリーを続行できません')
    .setDescription('本規約にご同意いただけない場合、チームへの参加手続きを進めることができません。')
    .setColor(0xe74c3c);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry_restart').setLabel('トップページに戻る').setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function askQ5(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Q5. 入会したいアカデミーをお選びください')
    .setColor(0x3498db);
  await interaction.reply({ embeds: [embed], components: [buildAcademySelectRow()] });
}

async function showAcademyMembersAndQ6(interaction, academyId) {
  const academy = ACADEMIES.find((a) => a.id === academyId);
  if (!academy) return;

  let members = [];
  try {
    members = await sheets.getAcademyMembers(academy.sheetName);
  } catch (err) {
    console.error('アカデミーメンバー取得エラー:', err);
  }

  const memberList = members.length ? members.map((m, i) => `${i + 1}. ${m}`).join('\n') : '（まだメンバーがいません）';

  const embed = new EmbedBuilder()
    .setTitle(`${academy.label} 所属メンバー`)
    .setDescription(memberList)
    .setColor(0x9b59b6)
    .setFooter({ text: 'Q6. こちらのアカデミーに入会しますか？' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`q6_yes_${academyId}`).setLabel('はい').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`q6_no_${academyId}`).setLabel('いいえ').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function showFinalConfirmation(interaction, channelId) {
  const s = session.get(channelId);

  if (!s.racerId) {
    const prefix = s.hasCompanyTeam ? 'A' : 'B';
    s.racerId = await sheets.getNextRacerId(prefix);
    session.update(channelId, { racerId: s.racerId });
  }

  const embed = new EmbedBuilder()
    .setTitle('最終確認')
    .addFields(
      { name: 'レーサーID', value: s.racerId || '-', inline: true },
      { name: '名前', value: s.name || '-', inline: true },
      { name: '街の電話番号', value: s.phone || '-', inline: true },
      { name: 'レーシングタブレット名', value: s.racingName || '-', inline: true },
      { name: '所属', value: s.finalTeam || '-', inline: true },
    )
    .setDescription(
      [
        '※企業チームに所属の虚偽はエントリーの取り消しになりますのでご注意ください。',
        '※企業チームに所属していない方はアカデミーに所属する必要があります。',
      ].join('\n'),
    )
    .setColor(0x2ecc71);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confirm_submit').setLabel('この内容で登録する').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('confirm_cancel').setLabel('最初からやり直す').setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function submitEntry(interaction, channelId) {
  const s = session.get(channelId);
  const academy = s.academyId ? ACADEMIES.find((a) => a.id === s.academyId) : null;

  await sheets.registerFullRoster({
    racerId: s.racerId,
    name: s.name,
    phone: s.phone,
    team: s.finalTeam,
    racingName: s.racingName,
    academySheetName: academy ? academy.sheetName : null,
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ エントリーが完了しました')
    .setDescription(
      [
        `ご登録ありがとうございました！あなたのレーサーIDは **${s.racerId}** です。`,
        '',
        '続いて、下のボタンからLGTの本部サーバーにご参加ください。',
      ].join('\n'),
    )
    .setColor(0x2ecc71);

  const inviteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('LGT本部サーバーに参加する').setStyle(ButtonStyle.Link).setURL(HQ_INVITE_URL),
  );

  await interaction.reply({ embeds: [embed], components: [inviteRow] });

  session.remove(channelId);

  try {
    const channel = interaction.channel;
    await channel.permissionOverwrites.edit(s.userId, { SendMessages: false });
  } catch (err) {
    console.error('チャンネルロックエラー:', err);
  }
}

async function restart(interaction, channelId) {
  session.create(channelId, interaction.user.id);
  const embed = new EmbedBuilder()
    .setTitle('🏁 LGTタイムアタック レーサーエントリー')
    .setDescription('下のボタンからエントリーフォームを開始してください。')
    .setColor(0x2ecc71);
  await interaction.reply({ embeds: [embed], components: [buildStartRow()] });
}

function buildStartRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry_start').setLabel('エントリーを開始する').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('entry_close_ticket').setLabel('🗑 チケットを閉じる').setStyle(ButtonStyle.Secondary),
  );
}

async function showRecovery(interaction, channelId) {
  session.create(channelId, interaction.user.id);
  const embed = new EmbedBuilder()
    .setTitle('⚠️ セッションが切れました')
    .setDescription(
      [
        '入力途中の内容が失われました（Botの再起動などが原因の可能性があります）。',
        'お手数ですが、下のボタンから最初からやり直してください。',
      ].join('\n'),
    )
    .setColor(0xe67e22);
  await interaction.reply({ embeds: [embed], components: [buildStartRow()] });
}

async function closeTicket(interaction, channelId) {
  session.remove(channelId);
  await interaction.reply({ content: '🗑 このチケットは5秒後に削除されます。' });
  setTimeout(() => {
    interaction.channel.delete().catch((err) => console.error('チャンネル削除エラー:', err));
  }, 5000);
}

const SESSION_REQUIRED_IDS_PREFIXES = ['q3_', 'q4_', 'q6_yes_', 'q6_no_', 'confirm_submit', 'select_company_team', 'select_academy'];

function requiresExistingSession(id) {
  return SESSION_REQUIRED_IDS_PREFIXES.some((prefix) => id.startsWith(prefix));
}

async function handleInteraction(interaction) {
  const channelId = interaction.channel?.id;

  if (interaction.isButton() && interaction.customId === 'entry_close_ticket') {
    await closeTicket(interaction, channelId);
    return;
  }

  // Botの再起動等でメモリ上のセッションが失われている場合は、クラッシュせず復旧導線を出す
  if (
    (interaction.isButton() || interaction.isStringSelectMenu()) &&
    requiresExistingSession(interaction.customId) &&
    !session.get(channelId)
  ) {
    await showRecovery(interaction, channelId);
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId === 'entry_modal_name_phone' && !session.get(channelId)) {
    await showRecovery(interaction, channelId);
    return;
  }

  // モーダル送信（Q1, Q2, レーシングタブレット名）
  if (interaction.isModalSubmit() && interaction.customId === 'entry_modal_name_phone') {
    const name = interaction.fields.getTextInputValue('input_name').trim();
    const phone = interaction.fields.getTextInputValue('input_phone').trim();
    const racingName = interaction.fields.getTextInputValue('input_racing_name').trim();
    session.update(channelId, { name, phone, racingName });
    await askQ3(interaction);
    return;
  }

  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === 'entry_start') {
      await askName_Phone(interaction);
      return;
    }

    if (id === 'q3_yes') {
      session.update(channelId, { hasCompanyTeam: true });
      await askCompanyTeam(interaction);
      return;
    }

    if (id === 'q3_no') {
      session.update(channelId, { hasCompanyTeam: false });
      await askQ4(interaction);
      return;
    }

    if (id === 'q4_agree') {
      await askQ5(interaction);
      return;
    }

    if (id === 'q4_disagree') {
      await showQ4Disagree(interaction);
      return;
    }

    if (id === 'entry_restart') {
      await restart(interaction, channelId);
      return;
    }

    if (id.startsWith('q6_yes_')) {
      const academyId = id.replace('q6_yes_', '');
      const academy = ACADEMIES.find((a) => a.id === academyId);
      session.update(channelId, { academyId, finalTeam: academy.label });
      await showFinalConfirmation(interaction, channelId);
      return;
    }

    if (id.startsWith('q6_no_')) {
      await askQ5(interaction);
      return;
    }

    if (id === 'confirm_submit') {
      await submitEntry(interaction, channelId);
      return;
    }

    if (id === 'confirm_cancel') {
      await restart(interaction, channelId);
      return;
    }
  }

  if (interaction.isStringSelectMenu()) {
    const id = interaction.customId;

    if (id.startsWith('select_company_team')) {
      const team = interaction.values[0];
      session.update(channelId, { companyTeam: team, finalTeam: team });
      await showFinalConfirmation(interaction, channelId);
      return;
    }

    if (id === 'select_academy') {
      const academyId = interaction.values[0];
      await showAcademyMembersAndQ6(interaction, academyId);
      return;
    }
  }
}

module.exports = { handleInteraction };
