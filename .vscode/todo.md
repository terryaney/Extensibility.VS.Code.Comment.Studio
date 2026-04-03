- Add a Extension Developers section to readme and make sure to document how to package an installer and other 'how to work with this project' information, available tasks, avail npm scripts, etc.
- Add a references section to bottom of readme
	- https://microsoft.github.io/vscode-codicons/dist/codicon.html
	- https://github.com/madskristensen/CommentsVS
	- https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/recommended-tags
- At some point I told it to remove 'refresh code anchor' b/c the 'scan' and 'refresh' were confusing.  But I saw this in package.json
"kat-comment-studio.refreshAnchors".  What was point of refresh again (vs scan)?  Will it ever be needed?  If we want to keep code around, lets make a future-ideas.md document and document why we might have this 'refresh' and where the code locations are.  Maybe change the title in package to include (OBSOLETE - SEE future-ideas.md) so if I scan package I don't wonder where there is surfacing?

- Review code base and/or plans completed and ensure readme is accurate.  All settings that exist are documents, obsolete ones removed
	- see if removes 'escape' from keyboard since I deleted that or turned off keybindings I think
	- make sure to document the LINK: well with solution relative examples for both workspace files in vs code, sln in vs code, and when you just open a sub folder what happens (or simply accept it will not work)
- Review VS Code readme and document anything that we didn't implement or confirm the items we did
	- i.e. background thread scanning

Bugs
- kat-comment-studio.collapseByDefault - is this working?  I onpened a file when rendering was on and xml collapsed and I haven't set the property ever and I never moved my cursor or anything when opening file via ctrl+p.

- Terry
	- Test all commands from pallette, some seem dead
	- Just launch and look at output...seems way too much??
	- Review readme and compare to VS extension
		- Review settings - categories or alpha?  Then do same to package.json
		- Generate a full { } settings section in jsonc for all settings available in my readme?
		- Need to improve readme to explain/list all commands, shortcuts, feature accessibility etc.
	- Open package.json file - look at the problems and ask AI, also change name to match test explorer, KAT - **
	- Remove all diagnostic logging (or at least comment it out)