import sys, importlib
sys.path.insert(0,'/home/claude/repo/design/tools')
import mk
mods=['m_design']
import m_design, m_sketch, m_cam; m_design.mock_design(); m_sketch.mock_sketch(); m_cam.mock_cam(); import m_misc; m_misc.welcome(); m_misc.settings(); m_misc.dialogs(); import m_gallery; m_gallery.gallery()
mk.write_support(); print('ok', len(mk.TX))
