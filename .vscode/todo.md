Misc Bugs:
- Render 'Throws' section in comment popup like the Arguments section - in a table format for each exception listed.
- What does Reflow All Comments do?  Current file or all files?  Change to Reflow Comments in File and Reflow Current Comment.
- Right click has Toggle Comment Rendering and Cycle Rendering Mode (Off -> On) - both seem to do same
- Never reflow an xml element (currently it reflowed <paramref name="desiredDay"/> before the name attribute)
- Can we put decoration of comment icon and right border line where reflow would happen when comments are expanded?
- If I have any left border decorations (like original VS extension), remove it completely and remove it from documentation, configuration and implementation.
- My reflowed comment looks nice in xml comment, but it does same breaks during rendering...I'd have expected it to just concatenate together and let markdown container handle warpping.  Only do line feeds (or maybe 2) for <para/> elements
- Currently, I colorize words no matter what in comments regardless of : indicator.  
	- Skip 'anchor' that is only one I don't want to colorize.
	- Add option for colorize mode for non ':' elements (: elements ALWAYS colorize regardless of start of line or not)
		- Never
		- Case sensitive
		- Case insensitive
- Remove Line Number + anchor syntax support (any implementatoin, documentation, configuration).  I don't agree with the need
- Can we put same 'scope' icon from tree pane in web panel to left of 'scope dropdown'?
- Can we put same 'filter' icon from tree pane into web panel to the left of 'filter anchors' input?
- I've been asking that my status bar icon '# Anchors' be in yellow font.  And it has been a battle.  I'm not sure why we can't set it.  But looking at my actual anchor pane, the color of file column in my grid is the exact 'yellow' I want.  Do it or tell me why not possible.
- In due date column, when past date, it puts date in red, I like, but if past date, can we also put a 'warning' codicon?
- When I generate a package, can it automatically bump the revision number in package.json before compiling?
- xml comment codelens - there is max length with min/max before ... truncation - make it so that if set to 0/blank there is no truncation, and that should be the default value
- Tell me if any of the custom xml elements are not 'handled' during popup rendering: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/recommended-tags

Implementation Wrong:
- Reflow Current Comment menu isn't disabling when not inside xml comment.
- Filter anchors in web pane.  It is aligned immediately after/right of Scope dropdown, instead of immediately before/left of *filter* input.  Please correct, and change tooltip to say 'Filter Anchors...'
- Overdue icon in grid warning is showing, but can you vertically center the icon and the text?  There is an awkward gap between the icon and text and it looks misaligned.
- Colorization, I had `// BUG: This is BUG and note hello`.  With case sensitive, neither BUG or note colorized.  With case insensitive, only note colorized.  Expected with case sensitive that BUG is colorized and note is not.

Additional Misc Bugs (For all requested changes below update all needed, readme, code, configuration, package.json etc.):
- Change default length for codelens comment preview to 205
- 'See Also' section in comment render popup. Change from bullet list to a table format like arguments/throws with following:
	- <seealso cref="System.String"/> - when cref is used, that is 'name' (in blue/code colorization) and if any content in the seealso element, that is the description.  Only the cref is what is linked and then populated in the vs code command pallete on click.
	- <seealso href="link">Link Text</seealso> - make the name simply 'Visit Url' (in link colorization) and the description is the link text.  When clicked, it opens the link in browser.
- Does Remove All Comments really work?  Seems agressive if it does.  Is there a confirmation?  Considering removing it.
- Remove the 'Expand Xml' and 'Collapse Xml' codelens feature.  I don't think it adds much especially with auto expand/colapse when cursor enters xml comment and the fact that I can't remove the collapse/expand chevron from left gutter from vs code.  Thoes two are sufficient.
- If <summary> is leveraging <para> elements the codelens should only work with content of first one (or content before the first one if present).

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

- Terry
	- Just launch and look at output...seems way too much??
	- Review readme and compare to VS extension
		- Review settings - categories or alpha?  Then do same to package.json
		- Generate a full { } settings section in jsonc for all settings available in my readme?
		- Need to improve readme to explain/list all commands, shortcuts, feature accessibility etc.
	- Open package.json file - look at the problems and ask AI, also change name to match test explorer, KAT - **
	- Remove all diagnostic logging (or at least comment it out)


Big xml edit bug:
1. Do we just remove 'reflow' action until they move out of comment or manually click the menu?
2. <para> opening elements should ALWAYS start on a new line.

Below is some of the bad behavior I noticed:

Started with (trimmed for brevity):

/// <summary>
/// Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals
/// <paramref name="desiredDay"/> and <paramref name="dateType"/>. How well does this work? It works like a charm. You
/// can find the next or previous occurrence of a day of the week, or the occurrence of a day of the week in the next

Issue 1: I typed <para> before 'Given' and </para> after the dateType paramRef.  Then, I hit enter after closing and after quick flicker, ended up with this:

/// <summary>
/// <para>Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals
/// <paramref name="desiredDay"/> and <paramref name="dateType"/>.</para> /// How well does this work? It works like a
/// charm. You can find the next or previous occurrence of a day of the week, or the occurrence of a day of the week in

Issue 2: Then I deleted the /// in front of /// How and hit enter before How and ended up with following on a new line (didn't delete extra /// - and this seemed broken to never delete extra /// for rest of my debug session, regardless of which line I was breaking on):

/// /// How well does this work? It works like a

If I selected from H backwards back up to the </para> and hit enter again just to try and clean it up, I ended up with Issue 1 result.

Issue 3: I started with following:

/// <summary>
/// <para>Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals
/// <paramref name="desiredDay"/> and <paramref name="dateType"/>.</para>
/// How well does this work? It works like a
/// charm. You can find the next or previous occurrence of a day of the week, or the occurrence of a day of the week in
/// the next or previous week. For example, if you want to find the next Tuesday from a given date, you can use this
/// method with dateType set to Next and desiredDay set to Tuesday. If you want to find the previous Friday, you can
/// use dateType Previous and desiredDay Friday. If you want to find the Tuesday in the next week, you can use dateType
/// NextWeek and desiredDay Tuesday. If you want to find the Friday in the previous week, you can use dateType
/// PreviousWeek and desiredDay Friday.
/// </summary>

After I did the following:
1. Typed <para> at start of line 3
2. Backspaced 'charm' (line 4) to end of line 3.
3. Typed </para> after `Friday.` on line 7

I ended up with following and didn't like that it brought starting <para> to line 2 of my comment.

/// <summary>
/// <para>Given a date and day of week, <b>finally</b>, find the next date whose day of the week equals
/// <paramref name="desiredDay"/> and <paramref name="dateType"/>.</para> <para>How well does this work? It works like
/// a charm. You can find the next or previous occurrence of a day of the week, or the occurrence of a day of the week
/// in the next or previous week. For example, if you want to find the next Tuesday from a given date, you can use this
/// method with dateType set to Next and desiredDay set to Tuesday. If you want to find the previous Friday, you can
/// use dateType Previous and desiredDay Friday.</para>If you want to find the Tuesday in the next week, you can use
/// dateType NextWeek and desiredDay Tuesday. If you want to find the Friday in the previous week, you can use dateType
/// PreviousWeek and desiredDay Friday.
/// </summary>
