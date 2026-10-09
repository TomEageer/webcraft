#!/usr/bin/env python3
"""把 VoxeLibre（CC BY-SA）的贴图与音效打包进 WebCraft。

用法：python3 tools/build_pack.py <VoxeLibre 仓库目录>
产物：
  assets/pack_tex.js   贴图（base64 data URL，file:// 下也能读取像素）
  assets/pack_snd.js   音效/音乐索引（指向 assets/sounds、assets/music 下的 ogg）
  assets/sounds/*.ogg  音效
  assets/music/*.ogg   背景音乐
  assets/CREDITS.md    署名与许可
"""
import base64, glob, json, os, shutil, sys

SKIP_PREFIX = ('_', 'mcl_skins', 'doc_', 'mcl_achievements', 'crafting_creative', 'mcl_inventory', 'mcl_base_textures',
               'mcl_banners', 'mcl_shield_pattern', 'mcl_enchanting_glyph', 'hudbars', 'mcl_title', 'mcl_maps', 'object_crosshair')
MUSIC_DIR = 'mods/PLAYER/mcl_music/sounds'


def main():
    src = os.path.abspath(sys.argv[1])
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, 'assets')
    for d in ('sounds', 'music'):
        p = os.path.join(out, d)
        if os.path.isdir(p):
            shutil.rmtree(p)
        os.makedirs(p)

    tex = {}
    for f in sorted(glob.glob(os.path.join(src, 'textures', '*.png'))):
        name = os.path.basename(f)[:-4]
        if name.startswith(SKIP_PREFIX) or 'formspec' in name or name.endswith('_bg'):
            continue
        with open(f, 'rb') as fh:
            tex[name] = 'data:image/png;base64,' + base64.b64encode(fh.read()).decode()
    with open(os.path.join(out, 'pack_tex.js'), 'w') as fh:
        fh.write('// 自动生成：VoxeLibre 贴图（CC BY-SA，见 assets/CREDITS.md）\nwindow.PACK_TEX=')
        json.dump(tex, fh, separators=(',', ':'))
        fh.write(';\n')

    snd, music = {}, []
    for f in sorted(glob.glob(os.path.join(src, 'mods', '**', '*.ogg'), recursive=True)):
        base = os.path.basename(f)
        if MUSIC_DIR in f:
            shutil.copy(f, os.path.join(out, 'music', base))
            music.append('assets/music/' + base)
        else:
            shutil.copy(f, os.path.join(out, 'sounds', base))
            # default_dig_cracky.1.ogg -> 键 default_dig_cracky，多个变体组成数组
            key = base[:-4]
            parts = key.rsplit('.', 1)
            if len(parts) == 2 and parts[1].isdigit():
                key = parts[0]
            snd.setdefault(key, []).append('assets/sounds/' + base)
    with open(os.path.join(out, 'pack_snd.js'), 'w') as fh:
        fh.write('// 自动生成：VoxeLibre 音效与音乐（CC BY-SA，见 assets/CREDITS.md）\nwindow.PACK_SND=')
        json.dump(snd, fh, separators=(',', ':'), ensure_ascii=False)
        fh.write(';\nwindow.PACK_MUSIC=')
        json.dump(music, fh, ensure_ascii=False)
        fh.write(';\n')

    credits = open(os.path.join(src, 'LEGAL.md')).read()
    with open(os.path.join(out, 'CREDITS.md'), 'w') as fh:
        fh.write('# 素材来源与许可\n\n本目录下的贴图、音效与音乐取自 VoxeLibre（https://github.com/VoxeLibre/VoxeLibre），'
                 '按其各自的开放许可（主要为 CC BY-SA 3.0 / 4.0）使用，未作商业用途。以下为 VoxeLibre 原始许可说明：\n\n')
        fh.write(credits)
        fh.write('\n\n## 音乐\n\n')
        for line in open(os.path.join(src, 'CREDITS.md')):
            if line.startswith('* ') and ('Reaven' in line or 'Jester' in line or 'Exhale' in line or 'Diminixed' in line or 'Herowl' in line):
                fh.write(line)
    print(f'贴图 {len(tex)} 张，音效 {len(snd)} 组，音乐 {len(music)} 首')


if __name__ == '__main__':
    main()
