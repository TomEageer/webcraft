#!/usr/bin/env python3
"""从你自己的 Minecraft Java 版客户端素材生成「原版素材覆盖包」，仅供本机个人使用。

用法：python3 tools/build_vanilla.py <你解包出的客户端目录>/assets/minecraft
产物（全部在 assets/vanilla/ 下，不要分发、不要上传）：
  tex.js      window.VANILLA_TEX：键沿用 VoxeLibre 贴图名，值为原版贴图 data URL
  snd.js      window.VANILLA_SND：游戏音效事件名 -> 原版 ogg 列表；window.VANILLA_MUSIC
  sounds/     用到的原版 ogg
游戏启动时若存在该覆盖包，就用它覆盖 VoxeLibre 素材；删掉 assets/vanilla 即恢复。
"""
import base64, glob, io, itertools, json, os, re, shutil, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'vanilla')

# ---------------- 贴图：VoxeLibre 名 -> 原版路径（textures/ 下，不含 .png） ----------------
MANUAL = {
    'crafting_workbench_front': 'block/crafting_table_front', 'crafting_workbench_side': 'block/crafting_table_side',
    'crafting_workbench_top': 'block/crafting_table_top', 'default_clay_brick': 'item/brick', 'default_clay_lump': 'item/clay_ball',
    'default_coal_lump': 'item/coal', 'default_cobble': 'block/cobblestone', 'default_dry_shrub': 'block/dead_bush',
    'default_furnace_front_active': 'block/furnace_front_on', 'default_furnace_front': 'block/furnace_front',
    'default_furnace_side': 'block/furnace_side', 'default_furnace_top': 'block/furnace_top', 'default_leaves': 'block/oak_leaves',
    'default_mossycobble': 'block/mossy_cobblestone', 'default_rail_curved': 'block/rail_corner', 'default_rail': 'block/rail',
    'default_sapling': 'block/oak_sapling', 'default_steel_block': 'block/iron_block', 'default_steel_ingot': 'item/iron_ingot',
    'default_stone_brick': 'block/stone_bricks', 'default_tool_netheriteaxe': 'item/netherite_axe',
    'default_tool_netheritepick': 'item/netherite_pickaxe', 'default_tool_netheriteshovel': 'item/netherite_shovel',
    'default_tool_netheritesword': 'item/netherite_sword', 'default_tool_shears': 'item/shears', 'default_torch_on_floor': 'block/torch',
    'default_tree': 'block/oak_log', 'default_tree_top': 'block/oak_log_top', 'default_wood': 'block/oak_planks',
    'default_stone': 'block/stone', 'default_dirt': 'block/dirt', 'default_sand': 'block/sand', 'default_gravel': 'block/gravel',
    'default_clay': 'block/clay', 'default_snow': 'block/snow', 'default_ice': 'block/ice', 'default_glass': 'block/glass',
    'default_obsidian': 'block/obsidian', 'default_brick': 'block/bricks', 'default_bookshelf': 'block/bookshelf',
    'default_gold_block': 'block/gold_block', 'default_diamond_block': 'block/diamond_block', 'default_coal_block': 'block/coal_block',
    'default_tnt_side': 'block/tnt_side', 'default_tnt_top': 'block/tnt_top', 'default_tnt_bottom': 'block/tnt_bottom',
    'default_stick': 'item/stick', 'default_gold_ingot': 'item/gold_ingot', 'default_diamond': 'item/diamond', 'default_flint': 'item/flint',
    'default_book': 'item/book', 'default_paper': 'item/paper', 'default_gunpowder': 'item/gunpowder', 'default_apple': 'item/apple',
    'doors_item_steel': 'item/iron_door', 'doors_item_wood': 'item/oak_door', 'doors_trapdoor': 'block/oak_trapdoor',
    'doors_trapdoor_steel': 'block/iron_trapdoor',
    'extra_mobs_piglin': 'entity/piglin/piglin', 'extra_mobs_zombified_piglin': 'entity/piglin/zombified_piglin',
    'farming_carrot_1': 'block/carrots_stage0', 'farming_carrot_2': 'block/carrots_stage1', 'farming_carrot_3': 'block/carrots_stage2',
    'farming_carrot_4': 'block/carrots_stage3', 'farming_carrot_gold': 'item/golden_carrot', 'farming_melon': 'item/melon_slice',
    'farming_potato_poison': 'item/poisonous_potato', 'farming_tool_netheritehoe': 'item/netherite_hoe', 'farming_wheat_harvested': 'item/wheat',
    'farming_bread': 'item/bread', 'farming_mushroom_stew': 'item/mushroom_stew', 'farming_pumpkin_side': 'block/pumpkin_side',
    'farming_pumpkin_top': 'block/pumpkin_top', 'farming_melon_side': 'block/melon_side', 'farming_melon_top': 'block/melon_top',
    'farming_mushroom_red': 'block/red_mushroom', 'farming_mushroom_brown': 'block/brown_mushroom',
    'fire_basic_flame_animated': 'block/fire_0', 'soul_fire_basic_flame_animated': 'block/soul_fire_0',
    'fletching_table_bottom': 'block/birch_planks', 'flowers_dandelion_yellow': 'block/dandelion', 'flowers_tulip': 'block/orange_tulip',
    'hardened_clay': 'block/terracotta',
    'jeija_lightstone_gray_off': 'block/redstone_lamp', 'jeija_lightstone_gray_on': 'block/redstone_lamp_on',
    'jeija_torches_off': 'block/redstone_torch_off', 'jeija_torches_on': 'block/redstone_torch', 'jeija_wall_lever': 'block/lever',
    'mcl_amethyst_calcite_block': 'block/calcite', 'mcl_anvils_anvil_base': 'block/anvil',
    'mcl_anvils_anvil_top_damaged_0': 'block/anvil_top', 'mcl_anvils_anvil_top_damaged_1': 'block/chipped_anvil_top',
    'mcl_anvils_anvil_top_damaged_2': 'block/damaged_anvil_top',
    'mcl_blackstone_gilded': 'block/gilded_blackstone', 'mcl_blackstone_polished': 'block/polished_blackstone',
    'mcl_blackstone_polished_bricks': 'block/polished_blackstone_bricks', 'mcl_blackstone_side': 'block/blackstone',
    'mcl_blackstone_top': 'block/blackstone_top', 'mcl_bows_arrow_inv': 'item/arrow',
    'mcl_cartography_table_side1': 'block/cartography_table_side1', 'mcl_cartography_table_side3': 'block/cartography_table_side3',
    'mcl_cartography_table_top': 'block/cartography_table_top',
    'mcl_cherry_blossom_door_bottom': 'block/cherry_door_bottom', 'mcl_cherry_blossom_door_top': 'block/cherry_door_top',
    'mcl_cherry_blossom_door_inv': 'item/cherry_door', 'mcl_cherry_blossom_leaves': 'block/cherry_leaves',
    'mcl_cherry_blossom_log': 'block/cherry_log', 'mcl_cherry_blossom_log_top': 'block/cherry_log_top',
    'mcl_cherry_blossom_planks': 'block/cherry_planks', 'mcl_cherry_blossom_sapling': 'block/cherry_sapling',
    'mcl_cherry_blossom_trapdoor': 'block/cherry_trapdoor', 'mcl_cocoa_beans': 'item/cocoa_beans',
    'mcl_comparators_item': 'item/comparator', 'mcl_comparators_off': 'block/comparator', 'mcl_comparators_on': 'block/comparator_on',
    'mcl_copper_block': 'block/copper_block', 'mcl_copper_block_cut': 'block/cut_copper', 'mcl_copper_exposed': 'block/exposed_copper',
    'mcl_copper_exposed_cut': 'block/exposed_cut_copper', 'mcl_copper_ore': 'block/copper_ore', 'mcl_copper_oxidized': 'block/oxidized_copper',
    'mcl_copper_oxidized_cut': 'block/oxidized_cut_copper', 'mcl_copper_raw': 'item/raw_copper', 'mcl_copper_weathered': 'block/weathered_copper',
    'mcl_copper_weathered_cut': 'block/weathered_cut_copper', 'mcl_copper_ingot': 'item/copper_ingot',
    'mcl_core_andesite_smooth': 'block/polished_andesite', 'mcl_core_diorite_smooth': 'block/polished_diorite',
    'mcl_core_granite_smooth': 'block/polished_granite', 'mcl_core_grass_path_side': 'block/dirt_path_side',
    'mcl_core_grass_path_top': 'block/dirt_path_top', 'mcl_core_grass_side_snowed': 'block/grass_block_snow',
    'mcl_core_grass_block_top': 'block/grass_block_top', 'mcl_core_grass_block_side_overlay': 'block/grass_block_side_overlay',
    'mcl_core_lava_source_animation': 'block/lava_still', 'mcl_core_water_source_animation': 'block/water_still',
    'mcl_core_papyrus': 'block/sugar_cane', 'mcl_core_reeds': 'item/sugar_cane', 'mcl_core_sandstone_normal': 'block/sandstone',
    'mcl_core_sandstone_top': 'block/sandstone_top', 'mcl_core_sandstone_bottom': 'block/sandstone_bottom',
    'mcl_core_stonebrick_cracked': 'block/cracked_stone_bricks', 'mcl_core_stonebrick_mossy': 'block/mossy_stone_bricks',
    'mcl_core_bedrock': 'block/bedrock', 'mcl_core_ice_packed': 'block/packed_ice', 'mcl_core_red_sand': 'block/red_sand',
    'mcl_core_log_birch': 'block/birch_log', 'mcl_core_log_birch_top': 'block/birch_log_top', 'mcl_core_planks_birch': 'block/birch_planks',
    'mcl_core_log_spruce': 'block/spruce_log', 'mcl_core_log_spruce_top': 'block/spruce_log_top', 'mcl_core_planks_spruce': 'block/spruce_planks',
    'mcl_core_leaves_spruce': 'block/spruce_leaves', 'mcl_core_sapling_birch': 'block/birch_sapling', 'mcl_core_sapling_spruce': 'block/spruce_sapling',
    'mcl_core_emerald': 'item/emerald', 'mcl_core_lapis': 'item/lapis_lazuli', 'mcl_core_charcoal': 'item/charcoal',
    'mcl_crimson_crimson_hyphae_wood': 'block/crimson_planks', 'mcl_crimson_warped_hyphae_wood': 'block/warped_planks',
    'mcl_crimson_stripped_crimson_stem_side': 'block/stripped_crimson_stem', 'mcl_crimson_stripped_warped_stem_side': 'block/stripped_warped_stem',
    'mcl_deepslate_top': 'block/deepslate_top', 'mcl_deepslate': 'block/deepslate', 'mcl_cobbled_deepslate': 'block/cobbled_deepslate',
    'mcl_dispensers_dispenser_front_horizontal': 'block/dispenser_front', 'mcl_droppers_dropper_front_horizontal': 'block/dropper_front',
    'mcl_doors_door_birch_lower': 'block/birch_door_bottom', 'mcl_doors_door_birch_upper': 'block/birch_door_top',
    'mcl_doors_door_iron_lower': 'block/iron_door_bottom', 'mcl_doors_door_iron_upper': 'block/iron_door_top',
    'mcl_doors_door_spruce_lower': 'block/spruce_door_bottom', 'mcl_doors_door_spruce_upper': 'block/spruce_door_top',
    'mcl_doors_door_wood_lower': 'block/oak_door_bottom', 'mcl_doors_door_wood_upper': 'block/oak_door_top',
    'mcl_enchanting_table_bottom': 'block/enchanting_table_bottom', 'mcl_enchanting_table_side': 'block/enchanting_table_side',
    'mcl_enchanting_table_top': 'block/enchanting_table_top', 'mcl_end_crystal_item': 'item/end_crystal',
    'mcl_end_end_bricks': 'block/end_stone_bricks', 'mcl_end_purpur_pillar': 'block/purpur_pillar_side', 'mcl_end_ender_eye': 'item/ender_eye',
    'mcl_experience_bottle': 'item/experience_bottle',
    'mcl_farming_farmland_dry': 'block/farmland', 'mcl_farming_hayblock_side': 'block/hay_block_side', 'mcl_farming_hayblock_top': 'block/hay_block_top',
    'mcl_farming_pumpkin_stem_disconnected': 'block/pumpkin_stem', 'mcl_farming_sweet_berry': 'item/sweet_berries',
    'mcl_farming_wheat_seeds': 'item/wheat_seeds',
    'mcl_fishing_clownfish_raw': 'item/tropical_fish', 'mcl_fishing_fish_cooked': 'item/cooked_cod', 'mcl_fishing_fish_raw': 'item/cod',
    'mcl_fishing_pufferfish_raw': 'item/pufferfish', 'mcl_fishing_salmon_raw': 'item/salmon', 'mcl_flowers_tallgrass': 'block/short_grass',
    'mcl_hoppers_item': 'item/hopper', 'mcl_lanterns_chain_inv': 'item/iron_chain', 'mcl_lanterns_lantern_inv': 'item/lantern',
    'mcl_minecarts_rail_golden': 'block/powered_rail', 'mcl_minecarts_rail_golden_powered': 'block/powered_rail_on',
    'mcl_mobitems_beef_raw': 'item/beef', 'mcl_mobitems_chicken_raw': 'item/chicken', 'mcl_mobitems_mutton_raw': 'item/mutton',
    'mcl_mobitems_porkchop_raw': 'item/porkchop', 'mcl_mobitems_slimeball': 'item/slime_ball',
    'mcl_mobitems_beef_cooked': 'item/cooked_beef', 'mcl_mobitems_chicken_cooked': 'item/cooked_chicken',
    'mcl_mobitems_mutton_cooked': 'item/cooked_mutton', 'mcl_mobitems_porkchop_cooked': 'item/cooked_porkchop',
    'mcl_nether_netherbrick': 'item/nether_brick', 'mcl_nether_netheriteblock': 'block/netherite_block',
    'mcl_nether_quartz_chiseled_side': 'block/chiseled_quartz_block', 'mcl_nether_quartz_chiseled_top': 'block/chiseled_quartz_block_top',
    'mcl_nether_quartz_ore': 'block/nether_quartz_ore', 'mcl_nether_red_nether_brick': 'block/red_nether_bricks',
    'mcl_nether_glowstone': 'block/glowstone', 'mcl_nether_glowstone_dust': 'item/glowstone_dust', 'mcl_nether_magma': 'block/magma',
    'mcl_observers_observer_back_lit': 'block/observer_back_on', 'mcl_ocean_prismarine_anim': 'block/prismarine',
    'mcl_portals_endframe_top': 'block/end_portal_frame_top', 'mcl_portals_endframe_side': 'block/end_portal_frame_side',
    'mcl_portals_endframe_eye': 'block/end_portal_frame_eye', 'mcl_portals_endframe_bottom': 'block/end_stone',
    'mcl_portals_portal': 'block/nether_portal', 'mcl_throwing_ender_pearl': 'item/ender_pearl',
    'mcl_potions_lingering_bottle': 'item/lingering_potion', 'mcl_potions_melon_speckled': 'item/glistering_melon_slice',
    'mcl_potions_potion_bottle': 'item/potion', 'mcl_potions_splash_bottle': 'item/splash_potion', 'mcl_potions_splash_overlay': 'item/potion_overlay',
    'mcl_raw_ores_raw_gold': 'item/raw_gold', 'mcl_raw_ores_raw_iron': 'item/raw_iron',
    'mcl_smithing_table_bottom': 'block/smithing_table_bottom', 'mcl_smithing_table_front': 'block/smithing_table_front',
    'mcl_smithing_table_side': 'block/smithing_table_side', 'mcl_smithing_table_top': 'block/smithing_table_top',
    'mcl_stonecutter_bottom': 'block/stonecutter_bottom', 'mcl_stonecutter_saw': 'block/stonecutter_saw',
    'mcl_stonecutter_side': 'block/stonecutter_side', 'mcl_stonecutter_top': 'block/stonecutter_top',
    'mcl_composter_bottom': 'block/composter_bottom', 'mcl_composter_compost': 'block/composter_compost',
    'mcl_composter_ready': 'block/composter_ready', 'mcl_composter_side': 'block/composter_side', 'mcl_composter_top': 'block/composter_top',
    'mesecons_delayer_item': 'item/repeater', 'mesecons_delayer_off': 'block/repeater', 'mesecons_delayer_on': 'block/repeater_on',
    'mesecons_noteblock': 'block/note_block', 'mesecons_piston_back': 'block/piston_bottom', 'mesecons_piston_bottom': 'block/piston_side',
    'mesecons_piston_on_front': 'block/piston_inner', 'mesecons_piston_pusher_front': 'block/piston_top',
    'mesecons_piston_pusher_front_sticky': 'block/piston_top_sticky', 'mesecons_piston_pusher_back': 'block/piston_top',
    'mesecons_piston_pusher_top': 'block/piston_side',
    'mob_spawner': 'block/spawner', 'mcl_chests_normal': 'entity/chest/normal', 'mobs_mc_ghast_firing': 'entity/ghast/ghast_shooting', 'mobs_mc_sheep_fur': 'entity/sheep/sheep_wool',
    'redstone_redstone_block': 'block/redstone_block', 'redstone_redstone_dust': 'item/redstone',
    'vl_mobitems_flaming_powder': 'item/blaze_powder', 'vl_mobitems_flaming_rod': 'item/blaze_rod',
    'xpanes_pane_iron': 'block/iron_bars', 'xpanes_top_glass_natural': 'block/glass_pane_top',
    'mcl_mobitems_string': 'item/string', 'mcl_mobitems_feather': 'item/feather', 'mcl_mobitems_leather': 'item/leather',
    'mcl_mobitems_bone': 'item/bone', 'mcl_mobitems_rotten_flesh': 'item/rotten_flesh', 'mcl_dye_white': 'item/white_dye',
    'mcl_buckets_bucket': 'item/bucket', 'mcl_buckets_water_bucket': 'item/water_bucket', 'mcl_buckets_lava_bucket': 'item/lava_bucket',
    'mcl_fire_flint_and_steel': 'item/flint_and_steel', 'mcl_bows_bow': 'item/bow', 'default_clay_lump': 'item/clay_ball',
    'mcl_end_end_stone': 'block/end_stone', 'mcl_end_purpur_block': 'block/purpur_block', 'mcl_end_purpur_pillar_top': 'block/purpur_pillar_top',
    'mcl_end_chorus_fruit': 'item/chorus_fruit', 'mcl_end_chorus_fruit_popped': 'item/popped_chorus_fruit', 'mcl_end_dragon_egg': 'block/dragon_egg',
    'mcl_end_end_rod': 'block/end_rod', 'mcl_end_chorus_plant': 'block/chorus_plant', 'mcl_end_chorus_flower': 'block/chorus_flower',
    'mcl_end_chorus_flower_dead': 'block/chorus_flower_dead',
    'mcl_flowers_fern': 'block/fern', 'mcl_flowers_poppy': 'block/poppy', 'mcl_flowers_cornflower': 'block/cornflower',
    'mcl_flowers_allium': 'block/allium', 'mcl_flowers_oxeye_daisy': 'block/oxeye_daisy',
}
for i, s in enumerate((1, 3, 5, 7)):
    MANUAL['mcl_farming_wheat_stage_%d' % s] = 'block/wheat_stage%d' % s
for i in range(4):
    MANUAL['mcl_farming_beetroot_%d' % i] = 'block/beetroots_stage%d' % i
    MANUAL['mcl_farming_potatoes_stage_%d' % i] = 'block/potatoes_stage%d' % i
    MANUAL['mcl_farming_sweet_berry_bush_%d' % i] = 'block/sweet_berry_bush_stage%d' % i
for i in range(3):
    MANUAL['mcl_nether_nether_wart_stage_%d' % i] = 'block/nether_wart_stage%d' % i
for vlm, mc in [('wood', 'wooden'), ('stone', 'stone'), ('steel', 'iron'), ('gold', 'golden'), ('diamond', 'diamond')]:
    for vlt, mct in [('pick', 'pickaxe'), ('axe', 'axe'), ('shovel', 'shovel'), ('sword', 'sword')]:
        MANUAL['default_tool_%s%s' % (vlm, vlt)] = 'item/%s_%s' % (mc, mct)
    MANUAL['farming_tool_%shoe' % vlm] = 'item/%s_hoe' % mc
MANUAL.update({'hbarmor_icon': 'gui/sprites/hud/armor_full', 'hbarmor_bgicon': 'gui/sprites/hud/armor_empty',
               'hbhunger_icon': 'gui/sprites/hud/food_full', 'hbhunger_bgicon': 'gui/sprites/hud/food_empty',
               'heart': 'gui/sprites/hud/heart/full', 'mcl_playerplus_end_sky': 'environment/end_sky'})
# VoxeLibre 包里没打进来、但游戏会按名字找的贴图（HUD 心形）
EXTRA = {'hudbars_icon_health': 'gui/sprites/hud/heart/full', 'hudbars_bgicon_health': 'gui/sprites/hud/heart/container', 'hudbars_icon_breath': 'gui/sprites/hud/air',
         'mobs_mc_blaze': 'entity/blaze/blaze', 'weather_rain': 'environment/rain', 'weather_snow': 'environment/snow',
         'misc_underwater': 'misc/underwater'}
MANUAL.update(EXTRA)
# 颜色名：VoxeLibre -> 原版
WOOL = {'white': 'white', 'orange': 'orange', 'magenta': 'magenta', 'light_blue': 'light_blue', 'yellow': 'yellow', 'lime': 'lime',
        'pink': 'pink', 'dark_grey': 'gray', 'grey': 'light_gray', 'cyan': 'cyan', 'violet': 'purple', 'blue': 'blue', 'brown': 'brown',
        'dark_green': 'green', 'red': 'red', 'black': 'black'}
for k, v in WOOL.items():
    MANUAL['wool_' + k] = 'block/%s_wool' % v
DYE = dict(WOOL); DYE.pop('light_blue'); DYE['lightblue'] = 'light_blue'
for k, v in DYE.items():
    MANUAL['mcl_dye_' + k] = 'item/%s_dye' % v
for c in ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']:
    MANUAL['mcl_core_glass_' + c] = 'block/%s_stained_glass' % c
    MANUAL['xpanes_top_glass_' + c] = 'block/%s_stained_glass_pane_top' % c
MANUAL['mcl_core_glass_silver'] = 'block/light_gray_stained_glass'
MANUAL['xpanes_top_glass_silver'] = 'block/light_gray_stained_glass_pane_top'
for piece in ['helmet', 'chestplate', 'leggings', 'boots']:
    for vl, mc in [('leather', 'leather'), ('chain', 'chainmail'), ('iron', 'iron'), ('gold', 'golden'), ('diamond', 'diamond'), ('netherite', 'netherite')]:
        MANUAL['mcl_armor_inv_%s_%s' % (piece, vl)] = 'item/%s_%s' % (mc, piece)
EFFECTS = {'fatigue': 'mining_fatigue', 'food_poisoning': 'hunger', 'leaping': 'jump_boost', 'swiftness': 'speed', 'withering': 'wither'}
SPAWN = {'magmacube': 'magma_cube', 'zombie_pigman': 'zombified_piglin'}
# 这些 VoxeLibre 贴图与原版的含义/布局不同，保持 VoxeLibre
BAKE = {'block/spruce_leaves': (0x61, 0x99, 0x61), 'block/birch_leaves': (0x80, 0xA7, 0x55), 'block/jungle_leaves': (0x48, 0xB5, 0x18),
        'block/acacia_leaves': (0x48, 0xB5, 0x18), 'block/dark_oak_leaves': (0x48, 0xB5, 0x18), 'block/mangrove_leaves': (0x92, 0xC6, 0x48)}
KEEP = {'character', 'mcl_brewing_side', 'mcl_brewing_top', 'grindstone_front', 'grindstone_top', 'mcl_beds_bed_red_inv'}


# 原版生物群系 -> 本作的装饰/刷怪类别（决定放什么树、花草、刷什么动物、村庄风格）
BIOME_CAT = {
    'plains': 'plains', 'sunflower_plains': 'plains', 'meadow': 'plains', 'mushroom_fields': 'plains',
    'forest': 'forest', 'flower_forest': 'forest', 'dark_forest': 'forest', 'windswept_forest': 'forest', 'swamp': 'forest', 'mangrove_swamp': 'forest',
    'jungle': 'forest', 'sparse_jungle': 'forest', 'bamboo_jungle': 'forest', 'wooded_badlands': 'plains',
    'birch_forest': 'birch_forest', 'old_growth_birch_forest': 'birch_forest',
    'taiga': 'taiga', 'old_growth_pine_taiga': 'taiga', 'old_growth_spruce_taiga': 'taiga', 'grove': 'snowy_taiga',
    'snowy_taiga': 'snowy_taiga', 'snowy_plains': 'snowy_plains', 'ice_spikes': 'snowy_plains', 'snowy_slopes': 'snowy_peaks',
    'frozen_peaks': 'snowy_peaks', 'jagged_peaks': 'snowy_peaks', 'stony_peaks': 'stony_peaks', 'stony_shore': 'stony_peaks',
    'windswept_hills': 'stony_peaks', 'windswept_gravelly_hills': 'stony_peaks',
    'desert': 'desert', 'badlands': 'desert', 'eroded_badlands': 'desert',
    'savanna': 'plains', 'savanna_plateau': 'plains', 'windswept_savanna': 'plains',
    'beach': 'beach', 'snowy_beach': 'snowy_beach', 'river': 'ocean', 'frozen_river': 'frozen_ocean',
    'ocean': 'ocean', 'deep_ocean': 'ocean', 'cold_ocean': 'ocean', 'deep_cold_ocean': 'ocean', 'lukewarm_ocean': 'ocean',
    'deep_lukewarm_ocean': 'ocean', 'warm_ocean': 'ocean', 'frozen_ocean': 'frozen_ocean', 'deep_frozen_ocean': 'frozen_ocean',
    'cherry_grove': 'cherry_grove', 'pale_garden': 'pale_garden', 'dappled_forest': 'dappled_forest',
    'dripstone_caves': 'plains', 'lush_caves': 'plains', 'deep_dark': 'plains', 'sulfur_caves': 'plains',
}


def write_biomes(van_root):
    """原版生物群系：中文名、温度/湿度、草/树叶/水颜色（色图 + 覆盖 + 修正器）、是否降雪"""
    root = os.path.dirname(os.path.dirname(van_root))  # 原始结构/
    bdir = os.path.join(root, 'data', 'minecraft', 'worldgen', 'biome')
    lang = json.load(open(os.path.join(van_root, 'lang', 'zh_cn.json'), encoding='utf-8'))
    gmap = Image.open(os.path.join(van_root, 'textures', 'colormap', 'grass.png')).convert('RGB')
    fmap = Image.open(os.path.join(van_root, 'textures', 'colormap', 'foliage.png')).convert('RGB')
    def cmap(im, t, d):
        t = min(1, max(0, t)); d = min(1, max(0, d)) * t
        return list(im.getpixel((int((1 - t) * 255), int((1 - d) * 255))))
    hexc = lambda h: [int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]
    out = {}
    for f in sorted(glob.glob(os.path.join(bdir, '*.json'))):
        name = os.path.basename(f)[:-5]
        b = json.load(open(f))
        t, dn = b.get('temperature', 0.5), b.get('downfall', 0.5)
        e = b.get('effects', {})
        grass = hexc(e['grass_color']) if 'grass_color' in e else cmap(gmap, t, dn)
        foliage = hexc(e['foliage_color']) if 'foliage_color' in e else cmap(fmap, t, dn)
        mod = e.get('grass_color_modifier')
        if mod == 'swamp': grass = hexc('#6a7039')
        elif mod == 'dark_forest': grass = [((grass[i] & 0xFE) + [0x28, 0x34, 0x0A][i]) >> 1 for i in range(3)]
        out[name] = {
            'zh': lang.get('biome.minecraft.' + name, name), 'temp': t, 'downfall': dn, 'grass': grass, 'foliage': foliage,
            'water': hexc(e['water_color']) if 'water_color' in e else [63, 118, 228],
            'snowy': bool(b.get('has_precipitation')) and t < 0.15, 'dry': not b.get('has_precipitation', True),
            'cat': BIOME_CAT.get(name, 'plains'),
        }
    with open(os.path.join(OUT, 'biomes.js'), 'w') as fh:
        fh.write('// 自动生成：原版生物群系参数（取自本机客户端，仅限个人本地使用）\nwindow.VANILLA_BIOMES=')
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    print('生物群系', len(out))


def strip(n, mods):
    for m in mods:
        p = 'mcl_' + m + '_'
        if n.startswith(p):
            return n[len(p):]
    for p in ('mobs_mc_', 'default_', 'farming_', 'flowers_', 'mcl_', 'vl_'):
        if n.startswith(p):
            return n[len(p):]
    return n


def main():
    van_root = os.path.abspath(os.path.expanduser(sys.argv[1]))
    tex_dir = os.path.join(van_root, 'textures')
    vl = json.loads(open(os.path.join(ROOT, 'assets', 'pack_tex.js')).read().split('window.PACK_TEX=', 1)[1].rstrip().rstrip(';'))
    van = {}
    for f in glob.glob(tex_dir + '/**/*.png', recursive=True):
        rel = os.path.relpath(f, tex_dir)[:-4]
        van.setdefault(os.path.basename(rel), []).append(rel)
    mods = sorted({k.split('_')[1] for k in vl if k.startswith('mcl_')}, key=len, reverse=True)

    def find(stem, dirs):
        for d in dirs:
            for r in van.get(stem, []):
                if r.startswith(d + '/') and r.count('/') == 1:
                    return r
        return None

    def auto(k):
        if k in KEEP:
            return None
        if k in MANUAL:
            return MANUAL[k]
        m = re.match(r'mcl_potions_effect_(.+)$', k)
        if m:
            return 'mob_effect/' + EFFECTS.get(m.group(1), m.group(1))
        m = re.match(r'mobs_mc_spawn_icon_(.+)$', k)
        if m:
            return 'item/%s_spawn_egg' % SPAWN.get(m.group(1), m.group(1))
        if k.startswith(('mobs_mc_', 'extra_mobs_')):
            # 生物皮肤：只在 entity/ 下找同名（布局必须一致，后面再校验尺寸）
            s = strip(k, mods)
            for r in sorted(sum(van.values(), [])):
                if r.startswith('entity/') and os.path.basename(r) == s:
                    return r
            return None
        s = strip(k, mods)
        dirs = ('block', 'item')
        r = find(s, dirs) or find(k, dirs)
        if not r:
            toks = s.split('_')
            if len(toks) <= 4:
                for perm in itertools.permutations(toks):
                    r = find('_'.join(perm), dirs)
                    if r:
                        break
        return r

    def load(path):
        im = Image.open(path).convert('RGBA')
        stem = os.path.basename(path)[:-4]
        # 皮革制品原版是灰度 + 代码染色（默认皮革色 #A06540），再叠一层不染色的 overlay
        if re.match(r'leather_(helmet|chestplate|leggings|boots|horse_armor)$', stem):
            px = im.load()
            for y in range(im.size[1]):
                for x in range(im.size[0]):
                    r, g, b, a = px[x, y]
                    px[x, y] = (r * 0xA0 // 255, g * 0x65 // 255, b * 0x40 // 255, a)
            ov = os.path.join(os.path.dirname(path), stem + '_overlay.png')
            if os.path.isfile(ov):
                o = Image.open(ov).convert('RGBA')
                im.alpha_composite(o)
        return im

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, 'sounds'))
    out_tex, skipped, tinted = {}, [], []
    for k in list(vl) + [k for k in EXTRA if k not in vl]:
        durl = vl.get(k)
        rel = auto(k)
        if not rel:
            continue
        path = os.path.join(tex_dir, rel + '.png')
        if not os.path.isfile(path):
            skipped.append((k, rel, 'missing'))
            continue
        im = load(path)
        old = Image.open(io.BytesIO(base64.b64decode(durl.split(',', 1)[1]))).convert('RGBA') if durl else im
        if rel.startswith('entity/') and im.size != old.size:
            skipped.append((k, rel, 'size %s vs %s' % (im.size, old.size)))
            continue
        # 原版这些树叶是灰度、靠生物群系染色，而游戏里对应方块不再染色：按原版默认叶色烘焙进去
        if rel in BAKE:
            mul = [c / 255 for c in BAKE[rel]]
            px = im.load()
            for y in range(im.size[1]):
                for x in range(im.size[0]):
                    r, g, b, a = px[x, y]
                    px[x, y] = (int(r * mul[0]), int(g * mul[1]), int(b * mul[2]), a)
            tinted.append(k)
        buf = io.BytesIO()
        im.save(buf, 'PNG')
        out_tex[k] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    # 原版物品图标全集：键 vi_<物品名>，游戏里同名物品优先用它（颜色、造型与原版一致）
    for f in sorted(glob.glob(os.path.join(tex_dir, 'item', '*.png'))):
        stem = os.path.basename(f)[:-4]
        im = load(f)
        if im.size[1] > im.size[0]:
            im = im.crop((0, 0, im.size[0], im.size[0]))  # 动画图标只取第一帧
        buf = io.BytesIO(); im.save(buf, 'PNG')
        out_tex['vi_' + stem] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    # 原版粒子贴图全集：键 vp_<名字>（粒子系统打成图集用）
    for f in sorted(glob.glob(os.path.join(tex_dir, 'particle', '*.png'))):
        stem = os.path.basename(f)[:-4]
        buf = io.BytesIO(); load(f).save(buf, 'PNG')
        out_tex['vp_' + stem] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    # 原版方块贴图全集：键 vb_<名字>（新增的原版地形方块直接引用）
    for f in sorted(glob.glob(os.path.join(tex_dir, 'block', '*.png'))):
        stem = os.path.basename(f)[:-4]
        im = load(f)
        buf = io.BytesIO(); im.save(buf, 'PNG')
        out_tex['vb_' + stem] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    write_biomes(van_root)
    # 破坏裂纹：原版是 10 张独立图，拼成 VoxeLibre 的竖条
    stages = [os.path.join(tex_dir, 'block', 'destroy_stage_%d.png' % i) for i in range(10)]
    if all(os.path.isfile(p) for p in stages):
        strip_im = Image.new('RGBA', (16, 160))
        for i, p in enumerate(stages):
            strip_im.paste(load(p).resize((16, 16)), (0, i * 16))
        buf = io.BytesIO(); strip_im.save(buf, 'PNG')
        out_tex['crack_anylength'] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    with open(os.path.join(OUT, 'tex.js'), 'w') as fh:
        fh.write('// 自动生成：原版 Minecraft 贴图（取自本机客户端，仅限个人本地使用，勿分发）\nwindow.VANILLA_TEX=')
        json.dump(out_tex, fh, separators=(',', ':'))
        fh.write(';\n')

    # ---------------- 音效 ----------------
    sj = json.load(open(os.path.join(van_root, 'sounds.json')))

    def files(event, depth=0):
        e = sj.get(event)
        if not e or depth > 3:
            return []
        out = []
        for s in e.get('sounds', []):
            if isinstance(s, str):
                out.append(s)
            elif s.get('type') == 'event':
                out += files(s['name'], depth + 1)
            else:
                out.append(s['name'])
        return out

    mats = {'stone': 'stone', 'wood': 'wood', 'grass': 'grass', 'dirt': 'gravel', 'sand': 'sand', 'gravel': 'gravel', 'glass': 'glass',
            'wool': 'wool', 'snow': 'snow', 'metal': 'metal', 'ice': 'glass'}
    ev = {}
    for m, v in mats.items():
        ev['dig.' + m] = 'block.%s.break' % v
        ev['step.' + m] = 'block.%s.step' % v
        ev['place.' + m] = 'block.%s.place' % v
    ev.update({
        'place': 'block.stone.place', 'hurt': 'entity.player.hurt', 'drink': 'entity.generic.drink', 'fall': 'entity.player.big_fall',
        'explode': 'entity.generic.explode', 'fuse': 'entity.tnt.primed', 'pop': 'entity.item.pickup', 'xp': 'entity.experience_orb.pickup',
        'levelup': 'entity.player.levelup', 'eat': 'entity.generic.eat', 'burp': 'entity.player.burp', 'bow': 'entity.arrow.shoot',
        'arrow_hit': 'entity.arrow.hit', 'bucket': 'item.bucket.fill', 'bucket_lava': 'item.bucket.empty_lava', 'fizz': 'block.lava.extinguish',
        'extinguish': 'block.fire.extinguish', 'chest': 'block.chest.open', 'chest_close': 'block.chest.close',
        'door': 'block.wooden_door.open', 'door_close': 'block.wooden_door.close', 'shear': 'entity.sheep.shear',
        'break_tool': 'entity.item.break', 'flint': 'item.flintandsteel.use', 'splash': 'entity.player.splash', 'swim': 'entity.player.swim',
        'rain': 'weather.rain', 'thunder': 'entity.lightning_bolt.thunder', 'portal': 'block.portal.travel', 'enchant': 'block.enchantment_table.use',
        'brew': 'block.brewing_stand.brew', 'piston_out': 'block.piston.extend', 'piston_in': 'block.piston.contract',
        'button': 'block.stone_button.click_on', 'armor': 'item.armor.equip_generic', 'fire': 'block.fire.ambient',
        'end_portal': 'block.end_portal.spawn', 'cave': 'ambient.cave', 'click': 'ui.button.click', 'bottle.fill': 'item.bottle.fill',
        'bottle.pour': 'item.bottle.empty', 'attack': 'entity.player.attack.strong', 'wood_hit': 'block.wood.hit',
        'reel': 'entity.fishing_bobber.retrieve', 'potion.throw': 'entity.splash_potion.throw', 'potion.break': 'entity.splash_potion.break',
        'cow.milk': 'entity.cow.milk', 'bell': 'block.bell.use', 'anvil': 'block.anvil.land', 'anvil.use': 'block.anvil.use',
        'anvil.break': 'block.anvil.destroy', 'grindstone.use': 'block.grindstone.use', 'mcl_barrels_default_barrel_open': 'block.barrel.open',
        'mcl_barrels_default_barrel_close': 'block.barrel.close', 'mcl_anvils_anvil_use': 'block.anvil.use',
        'mobs_mc_iron_golem_random': 'entity.iron_golem.repair', 'mobs_mc_wither_spawn': 'entity.wither.spawn',
        'pearl.tp': 'entity.player.teleport', 'enderman.tp': 'entity.enderman.teleport', 'villager.trade': 'entity.villager.trade',
        'villager.yes': 'entity.villager.yes', 'ghast.shoot': 'entity.ghast.shoot', 'ghast.charge': 'entity.ghast.warn',
        'blaze.shoot': 'entity.blaze.shoot', 'dragon.say': 'entity.ender_dragon.growl', 'dragon.shoot': 'entity.ender_dragon.shoot',
        'magma_cube.jump': 'entity.magma_cube.jump', 'magma_cube.attack': 'entity.magma_cube.squish', 'slime': 'entity.slime.jump',
        'sulfur_cube.jump': 'entity.slime.jump', 'wolf.say': 'entity.wolf.ambient',
    })
    mobs = ['pig', 'cow', 'sheep', 'chicken', 'zombie', 'skeleton', 'spider', 'cave_spider', 'creeper', 'fox', 'creaking', 'villager',
            'enderman', 'endermite', 'iron_golem', 'wolf', 'zombified_piglin', 'piglin', 'piglin_brute', 'blaze', 'magma_cube', 'ghast',
            'witch', 'wither_skeleton', 'slime', 'sulfur_cube', 'cat', 'rabbit', 'horse', 'squid', 'bat', 'drowned', 'husk', 'stray',
            'hoglin', 'strider', 'shulker', 'wither', 'ender_dragon', 'wandering_trader', 'snow_golem', 'bee', 'axolotl', 'goat', 'frog']
    for m in mobs:
        for ours, theirs in (('say', 'ambient'), ('hurt', 'hurt'), ('death', 'death')):
            ev.setdefault('%s.%s' % (m, ours), 'entity.%s.%s' % (m, theirs))
    ev.setdefault('dragon.hurt', 'entity.ender_dragon.hurt'); ev.setdefault('dragon.death', 'entity.ender_dragon.death')
    snd, used, missing = {}, set(), []
    for k, e in ev.items():
        fl = files(e)
        if not fl:
            missing.append((k, e))
            continue
        snd[k] = []
        for n in fl:
            src = os.path.join(van_root, 'sounds', n + '.ogg')
            if not os.path.isfile(src):
                continue
            used.add(n)
            snd[k].append('assets/vanilla/sounds/' + n + '.ogg')
        if not snd[k]:
            del snd[k]
    music = []
    for f in sorted(glob.glob(os.path.join(van_root, 'sounds', 'music', 'game', '*.ogg'))):
        music.append(os.path.relpath(f, os.path.join(van_root, 'sounds'))[:-4])
    for n in used | set(music):
        dst = os.path.join(OUT, 'sounds', n + '.ogg')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy(os.path.join(van_root, 'sounds', n + '.ogg'), dst)
    with open(os.path.join(OUT, 'snd.js'), 'w') as fh:
        fh.write('// 自动生成：原版 Minecraft 音效（取自本机客户端，仅限个人本地使用，勿分发）\nwindow.VANILLA_SND=')
        json.dump(snd, fh, separators=(',', ':'))
        fh.write(';\nwindow.VANILLA_MUSIC=')
        json.dump(['assets/vanilla/sounds/' + m + '.ogg' for m in music], fh)
        fh.write(';\n')
    with open(os.path.join(OUT, 'README.txt'), 'w') as fh:
        fh.write('本目录由 tools/build_vanilla.py 从本机 Minecraft Java 版客户端素材生成，版权归 Mojang/Microsoft，'
                 '仅供个人本地使用，不要分发或上传。删除本目录即恢复 VoxeLibre 素材。\n')
    print('贴图 %d 张（VoxeLibre 共 %d，烘焙染色 %d），跳过 %d；音效事件 %d 个（缺 %d），音乐 %d 首' % (
        len(out_tex), len(vl), len(tinted), len(skipped), len(snd), len(missing), len(music)))
    json.dump({'skipped': skipped, 'tinted': tinted, 'missing_sounds': missing}, open(os.path.join(OUT, 'build_report.json'), 'w'),
              ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
