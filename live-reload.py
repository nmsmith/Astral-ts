#!/usr/bin/env python
from livereload import Server, shell

server = Server()

# Run Pug to rebuild the code when the file is changed
server.watch('site/*.pug', 'pug site')
server.serve(root='site')
