"""Inicializador do servidor do PDV.

Mantém o comando `python3 server.py [porta]` disponível a partir da raiz do
projeto; a implementação permanece organizada em `pdv_back/server.py`.
"""

from pathlib import Path
from runpy import run_path


run_path(Path(__file__).parent / 'pdv_back' / 'server.py', run_name='__main__')
