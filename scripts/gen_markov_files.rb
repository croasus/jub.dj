#!/usr/bin/env ruby
require 'json'

unless ARGV.count == 2
  puts "USAGE: ./gen_markov_files.rb CHAT_CACHE_DIR OUT_DIR"
  exit 1
end
cache_dir = ARGV.shift
out_dir = ARGV.shift

agg = Hash.new { |h,k| h[k] = [] }

Dir["#{cache_dir}/*"].each do |f|
  IO.foreach(f) do |line|
    obj = JSON.load(line)
    agg[obj['user']] << obj['text']
  end
end

agg.each_pair do |user, lines|
  next unless user
  puts user
  begin
    File.open("#{out_dir}/#{user}", 'w') do |f|
      f.write(lines.join("\n"))
    end
  rescue Exception => e
    puts e
  end
end
