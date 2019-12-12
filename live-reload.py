#!/usr/bin/env python
from livereload import Server, shell

server = Server()

# Run Pug to rebuild the code when the file is changed
server.watch('src/index.pug', 'pug src --out site')
server.serve(root='site')
